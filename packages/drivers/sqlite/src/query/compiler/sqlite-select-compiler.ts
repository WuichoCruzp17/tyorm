import type {
    CompiledQuery, QueryExpression, QueryPredicate, ResolvedJoinColumn, ResolvedJoinCondition,
    ResolvedMutation, ResolvedSelectQuery, SqlCompiler
} from '@tyorm/core';

const comparison = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', 'not-like': 'NOT LIKE' };

const aggregates = new Map([['count', 'COUNT'], ['sum', 'SUM'], ['avg', 'AVG'], ['min', 'MIN'], ['max', 'MAX']]);

function quote(identifier: string): string {
    return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable(name: string, schema?: string): string {
    return schema === undefined ? quote(name) : `${quote(schema)}.${quote(name)}`;
}

function table(name: string, alias: string, schema?: string): string {
    return `${qualifiedTable(name, schema)} AS ${quote(alias)}`;
}

function column({ tableAlias, columnName }: ResolvedJoinColumn): string {
    return `${quote(tableAlias)}.${quote(columnName)}`;
}

function joinCondition({ left, right }: ResolvedJoinCondition): string {
    return `${column(left)} = ${column(right)}`;
}

export class SQLiteSelectCompiler implements SqlCompiler {
    compile(resolved: ResolvedSelectQuery, parameters: Readonly<Record<string, unknown>> = {}): CompiledQuery {
        const values: unknown[] = [];
        const bind = (value: unknown) => {
            values.push(value);
            return '?';
        };
        const expression = (node: QueryExpression): string => {
            switch (node.kind) {
                case 'column': {
                    const reference = resolved.columns.find(item =>
                        item.sourceAlias === node.alias && item.property === node.property
                    );
                    if (!reference) throw new Error(`Unresolved column "${node.alias}.${node.property}".`);
                    return column(reference);
                }
                case 'vector-distance':
                    throw new Error('The SQLite provider does not support vector distance queries.');
                case 'aggregate': {
                    const name = aggregates.get(node.function);
                    if (name === undefined) throw new Error('Unsupported aggregate function.');
                    return `${name}(${node.argument ? expression(node.argument) : '*'})`;
                }
                case 'parameter':
                    if (!Object.hasOwn(parameters, node.name) || parameters[node.name] === undefined) {
                        throw new Error(`Missing query parameter "${node.name}".`);
                    }
                    return bind(parameters[node.name]);
                case 'null': return 'NULL';
                case 'literal': return bind(node.value);
            }
        };
        const predicate = (node: QueryPredicate): string => {
            switch (node.kind) {
                case 'comparison':
                    return `${expression(node.left)} ${comparison[node.operator]} ${expression(node.right)}`;
                case 'logical':
                    return `(${node.predicates.map(predicate).join(node.operator === 'and' ? ' AND ' : ' OR ')})`;
                case 'not': return `NOT (${predicate(node.predicate)})`;
                case 'is-null': return `${expression(node.expression)} IS ${node.negated ? 'NOT ' : ''}NULL`;
                case 'in':
                    return `${expression(node.expression)} ${node.negated ? 'NOT ' : ''}IN (${node.values.map(expression).join(', ')})`;
                case 'between':
                    return `${expression(node.expression)} ${node.negated ? 'NOT ' : ''}BETWEEN ${expression(node.lower)} AND ${expression(node.upper)}`;
            }
        };

        const { query } = resolved;
        const root = resolved.aliases.get(query.from.alias)?.metadata.entity;
        if (!root) throw new Error('Unresolved root alias.');
        const selections = query.selections.map(({ expression: node, alias }) =>
            expression(node) + (alias === undefined ? '' : ` AS ${quote(alias)}`)
        );
        const parts = [
            `SELECT ${query.distinct ? 'DISTINCT ' : ''}${selections.join(', ')}`,
            `FROM ${table(root.tableName, query.from.alias, root.schema)}`
        ];

        for (const { join, target, plan } of resolved.joins) {
            const type = join.type === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
            if (plan.kind === 'junction') {
                const junction = plan.table;
                parts.push(`${type} ${table(junction.name, junction.alias, junction.schema)} ON ${plan.sourceConditions.map(joinCondition).join(' AND ')}`);
            }
            const conditions = (plan.kind === 'direct' ? plan.conditions : plan.targetConditions).map(joinCondition);
            if (join.on) conditions.push(`(${predicate(join.on)})`);
            const entity = target.metadata.entity;
            parts.push(`${type} ${table(entity.tableName, target.alias, entity.schema)} ON ${conditions.join(' AND ')}`);
        }

        if (query.where) parts.push(`WHERE ${predicate(query.where)}`);
        if (query.groupBy?.length) parts.push(`GROUP BY ${query.groupBy.map(expression).join(', ')}`);
        if (query.having) parts.push(`HAVING ${predicate(query.having)}`);
        if (query.orderBy.length) {
            parts.push(`ORDER BY ${query.orderBy.map(order =>
                `${expression(order.expression)} ${order.direction === 'asc' ? 'ASC' : 'DESC'}`
            ).join(', ')}`);
        }
        if (query.limit !== undefined) parts.push(`LIMIT ${bind(query.limit)}`);
        else if (query.offset !== undefined) parts.push('LIMIT -1');
        if (query.offset !== undefined) parts.push(`OFFSET ${bind(query.offset)}`);
        return { sql: parts.join(' '), parameters: values };
    }

    compileMutation(query: ResolvedMutation): CompiledQuery {
        const target = qualifiedTable(query.table, query.schema);
        const parameters: unknown[] = [];
        const bind = (value: unknown) => {
            parameters.push(value);
            return '?';
        };
        const equality = ({ column, value }: { readonly column: string; readonly value: unknown }) =>
            `${quote(column)} = ${bind(value)}`;

        let sql: string;
        switch (query.kind) {
            case 'insert':
            case 'upsert': {
                const columns = query.values.map(({ column }) => quote(column));
                const placeholders = query.values.map(({ value }) => bind(value));
                sql = columns.length === 0
                    ? `INSERT INTO ${target} DEFAULT VALUES`
                    : `INSERT INTO ${target} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
                if (query.kind === 'upsert') {
                    const [first] = query.conflictColumns;
                    if (first === undefined || columns.length === 0) {
                        throw new Error('UPSERT requires insert values and a primary key.');
                    }
                    const assignments = query.assignments.length > 0
                        ? query.assignments.map(equality).join(', ')
                        : `${quote(first)} = excluded.${quote(first)}`;
                    sql += ` ON CONFLICT (${query.conflictColumns.map(quote).join(', ')}) DO UPDATE SET ${assignments}`;
                }
                break;
            }
            case 'update':
                if (query.values.length === 0 || query.key.length === 0) {
                    throw new Error('UPDATE requires assignments and a primary key.');
                }
                sql = `UPDATE ${target} SET ${query.values.map(equality).join(', ')} WHERE ${query.key.map(equality).join(' AND ')}`;
                break;
            case 'delete':
                if (query.key.length === 0) throw new Error('DELETE requires a primary key.');
                sql = `DELETE FROM ${target} WHERE ${query.key.map(equality).join(' AND ')}`;
                break;
        }

        const returning = query.returning.map(({ column, alias }) => `${quote(column)} AS ${quote(alias)}`);
        if (returning.length > 0) sql += ` RETURNING ${returning.join(', ')}`;
        return { sql, parameters };
    }
}
