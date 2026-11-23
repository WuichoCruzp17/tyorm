import type {
    CompiledQuery, QueryExpression, QueryPredicate, ResolvedJoinColumn, ResolvedJoinCondition,
    ResolvedMutation, ResolvedSelectQuery, SqlCompiler
} from '@tyorm/core';

const comparison = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', 'not-like': 'NOT LIKE' };

const aggregates = new Map([['count', 'COUNT'], ['sum', 'SUM'], ['avg', 'AVG'], ['min', 'MIN'], ['max', 'MAX']]);

function quote(identifier: string): string {
    return '`' + identifier.replaceAll('`', '``') + '`';
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

export class MySQLMutation implements CompiledQuery {
    constructor(
        readonly kind: ResolvedMutation['kind'],
        readonly sql: string,
        readonly parameters: readonly unknown[],
        readonly read: CompiledQuery,
        readonly updateOnConflict?: CompiledQuery
    ) {}
}

export class MySQLSelectCompiler implements SqlCompiler {
    compileMutation(query: ResolvedMutation): CompiledQuery {
        const target = qualifiedTable(query.table, query.schema);
        const returning = query.returning.map(({ column, alias }) => `${quote(column)} AS ${quote(alias)}`).join(', ');
        if (!returning) throw new Error('MySQL mutations require returned columns.');

        const assignment = ({ column }: { readonly column: string }) => `${quote(column)} = ?`;
        const values = (bindings: readonly { readonly value: unknown }[]) => bindings.map(binding => binding.value);
        const update = (assignments: readonly { readonly column: string; readonly value: unknown }[], where: string, key: readonly unknown[]) => ({
            sql: `UPDATE ${target} SET ${assignments.map(assignment).join(', ')} WHERE ${where}`,
            parameters: [...values(assignments), ...key]
        });
        const read = (where: string, parameters: readonly unknown[]): CompiledQuery => ({
            sql: `SELECT ${returning} FROM ${target} WHERE ${where} FOR UPDATE`, parameters
        });

        if (query.kind === 'delete' || query.kind === 'update') {
            if (query.key.length === 0) throw new Error('MySQL mutations require a primary key.');
            const where = query.key.map(assignment).join(' AND ');
            const key = values(query.key);
            if (query.kind === 'delete') {
                return new MySQLMutation('delete', `DELETE FROM ${target} WHERE ${where}`, key, read(where, key));
            }
            if (query.values.length === 0) throw new Error('UPDATE requires assignments.');
            const statement = update(query.values, where, key);
            return new MySQLMutation('update', statement.sql, statement.parameters, read(where, key));
        }

        const columns = query.values.map(binding => quote(binding.column)).join(', ');
        const placeholders = query.values.map(() => '?').join(', ');
        const sql = `INSERT INTO ${target} (${columns}) VALUES (${placeholders})`;
        const byColumn = new Map(query.values.map(binding => [binding.column, binding]));
        if (query.kind === 'upsert') {
            const key = query.conflictColumns.map(column => {
                const binding = byColumn.get(column);
                if (!binding) throw new Error('UPSERT requires all primary-key values.');
                return binding.value;
            });
            if (key.length === 0) throw new Error('UPSERT requires a primary key.');
            const where = query.conflictColumns.map(column => assignment({ column })).join(' AND ');
            const conflict = query.assignments.length > 0 ? update(query.assignments, where, key) : undefined;
            return new MySQLMutation('upsert', sql, values(query.values), read(where, key), conflict);
        }

        const keys = query.primaryKeys ?? [];
        if (keys.length === 0) throw new Error('MySQL INSERT requires primary-key metadata to return the row.');
        const generated = keys.filter(key => !byColumn.has(key.columnName));
        if (generated.length > 1 || generated.some(key => key.generation !== 'increment')) {
            throw new Error('MySQL INSERT requires assigned keys or one AUTO_INCREMENT key.');
        }
        const key: unknown[] = [];
        const where = keys.map(({ columnName }) => {
            const binding = byColumn.get(columnName);
            if (!binding) return `${quote(columnName)} = LAST_INSERT_ID()`;
            key.push(binding.value);
            return assignment({ column: columnName });
        }).join(' AND ');
        return new MySQLMutation('insert', sql, values(query.values), read(where, key));
    }
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
        else if (query.offset !== undefined) parts.push('LIMIT 18446744073709551615');
        if (query.offset !== undefined) parts.push(`OFFSET ${bind(query.offset)}`);
        return { sql: parts.join(' '), parameters: values };
    }
}
