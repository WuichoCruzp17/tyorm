import type {
    CompiledQuery,
    FunctionCall,
    ProcedureCall,
    QueryExpression,
    QueryPredicate,
    ResolvedJoinColumn,
    ResolvedJoinCondition,
    ResolvedMutation,
    ResolvedSelectQuery,
    SqlCompiler
} from '@tyorm/core';

const comparisons = {
    eq: '=',
    ne: '<>',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    like: 'LIKE',
    'not-like': 'NOT LIKE'
} as const;

const aggregates = new Map([
    ['count', 'COUNT_BIG'],
    ['sum', 'SUM'],
    ['avg', 'AVG'],
    ['min', 'MIN'],
    ['max', 'MAX']
]);

function quote(identifier: string): string {
    return `[${identifier.replaceAll(']', ']]')}]`;
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

export class SqlServerSelectCompiler implements SqlCompiler {
    compile(
        resolved: ResolvedSelectQuery,
        parameters: Readonly<Record<string, unknown>> = {}
    ): CompiledQuery {
        const values: unknown[] = [];
        const bind = (value: unknown) => {
            values.push(value);
            return `@p${values.length - 1}`;
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
                    throw new Error('The SQL Server provider does not support vector distance queries.');
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
                case 'null':
                    return 'NULL';
                case 'literal':
                    return bind(node.value);
            }
        };
        const predicate = (node: QueryPredicate): string => {
            switch (node.kind) {
                case 'comparison':
                    return `${expression(node.left)} ${comparisons[node.operator]} ${expression(node.right)}`;
                case 'logical':
                    return `(${node.predicates.map(predicate).join(node.operator === 'and' ? ' AND ' : ' OR ')})`;
                case 'not':
                    return `NOT (${predicate(node.predicate)})`;
                case 'is-null':
                    return `${expression(node.expression)} IS ${node.negated ? 'NOT ' : ''}NULL`;
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
        } else if (query.limit !== undefined || query.offset !== undefined) {
            parts.push('ORDER BY (SELECT NULL)');
        }
        if (query.limit !== undefined || query.offset !== undefined) {
            parts.push(`OFFSET ${bind(query.offset ?? 0)} ROWS`);
            if (query.limit !== undefined) parts.push(`FETCH NEXT ${bind(query.limit)} ROWS ONLY`);
        }
        return { sql: parts.join(' '), parameters: values };
    }

    compileMutation(query: ResolvedMutation): CompiledQuery {
        const values: unknown[] = [];
        const bind = (value: unknown) => {
            values.push(value);
            return `@p${values.length - 1}`;
        };
        const target = qualifiedTable(query.table, query.schema);
        const outputClause = (image: 'INSERTED' | 'DELETED') => {
            const columns = query.returning
                .map(({ column: name, alias }) => `${image}.${quote(name)} AS ${quote(alias)}`);
            return columns.length === 0 ? '' : ` OUTPUT ${columns.join(', ')}`;
        };
        const equality = ({ column: name, value }: { readonly column: string; readonly value: unknown }) =>
            `${quote(name)} = ${bind(value)}`;

        let statement: string;
        switch (query.kind) {
            case 'insert': {
                const columns = query.values.map(({ column: name }) => quote(name));
                const placeholders = query.values.map(({ value }) => bind(value));
                statement = `INSERT INTO ${target}` +
                    (columns.length === 0 ? '' : ` (${columns.join(', ')})`) +
                    `${outputClause('INSERTED')} ` +
                    (columns.length === 0
                        ? 'DEFAULT VALUES'
                        : `VALUES (${placeholders.join(', ')})`);
                break;
            }
            case 'update':
                if (query.values.length === 0 || query.key.length === 0) {
                    throw new Error('SQL Server UPDATE requires assignments and a primary key.');
                }
                statement = `UPDATE ${target} SET ${query.values.map(equality).join(', ')}` +
                    `${outputClause('INSERTED')} WHERE ${query.key.map(equality).join(' AND ')}`;
                break;
            case 'delete':
                if (query.key.length === 0) throw new Error('SQL Server DELETE requires a primary key.');
                statement = `DELETE FROM ${target}${outputClause('DELETED')} ` +
                    `WHERE ${query.key.map(equality).join(' AND ')}`;
                break;
            case 'upsert': {
                if (query.values.length === 0 || query.conflictColumns.length === 0) {
                    throw new Error('SQL Server UPSERT requires insert values and a primary key.');
                }
                const sourceColumns = query.values.map(({ column: name }) => quote(name));
                const sourceValues = query.values.map(({ value }) => bind(value));
                const sourceByColumn = new Map(query.values.map(({ column: name }, index) => [name, index]));
                const match = query.conflictColumns.map(name => {
                    const index = sourceByColumn.get(name);
                    if (index === undefined) {
                        throw new Error(`SQL Server UPSERT requires primary-key value "${name}".`);
                    }
                    return `[target].${quote(name)} = [source].${sourceColumns[index]}`;
                }).join(' AND ');
                const firstConflictColumn = query.conflictColumns[0];
                if (firstConflictColumn === undefined) {
                    throw new Error('SQL Server UPSERT requires a primary key.');
                }
                const firstConflictIndex = sourceByColumn.get(firstConflictColumn);
                if (firstConflictIndex === undefined) {
                    throw new Error(`SQL Server UPSERT requires primary-key value "${firstConflictColumn}".`);
                }
                const assignments = query.assignments.length > 0
                    ? query.assignments.map(({ column: name, value }) =>
                        `${quote(name)} = ${bind(value)}`
                    ).join(', ')
                    : `${quote(firstConflictColumn)} = [source].${sourceColumns[firstConflictIndex]}`;
                const insertColumns = query.values.map(({ column: name }) => quote(name));
                const insertValues = query.values.map((_, index) =>
                    `[source].${sourceColumns[index]}`
                );
                statement = `MERGE ${target} WITH (HOLDLOCK) AS [target] ` +
                    `USING (VALUES (${sourceValues.join(', ')})) AS [source] (${sourceColumns.join(', ')}) ` +
                    `ON ${match} WHEN MATCHED THEN UPDATE SET ${assignments} ` +
                    `WHEN NOT MATCHED THEN INSERT (${insertColumns.join(', ')}) ` +
                    `VALUES (${insertValues.join(', ')})${outputClause('INSERTED')};`;
                break;
            }
        }

        return { sql: statement, parameters: values };
    }

    compileProcedure(call: ProcedureCall): CompiledQuery {
        const values: unknown[] = [];
        const argumentsSql = (call.args ?? []).map(argument => {
            if (typeof argument === 'object' && argument !== null && 'mode' in argument) {
                if (argument.mode === 'out') {
                    values.push(null);
                    return `@p${values.length - 1} OUTPUT`;
                }
                if (argument.mode === 'inout') {
                    if (argument.value === undefined) {
                        throw new TypeError('SQL Server INOUT procedure parameters cannot be undefined.');
                    }
                    values.push(argument.value);
                    return `@p${values.length - 1} OUTPUT`;
                }
            }
            if (argument === undefined) {
                throw new TypeError('SQL Server procedure input parameters cannot be undefined.');
            }
            values.push(argument);
            return `@p${values.length - 1}`;
        });
        const name = qualifiedTable(call.name, call.schema);
        return {
            sql: `EXEC ${name}${argumentsSql.length === 0 ? '' : ` ${argumentsSql.join(', ')}`}`,
            parameters: values
        };
    }

    compileFunction(call: FunctionCall): CompiledQuery {
        const values = call.args ?? [];
        const argumentsSql = values.map((value, index) => {
            if (value === undefined) throw new TypeError('SQL Server function arguments cannot be undefined.');
            return `@p${index}`;
        });
        return {
            sql: `SELECT ${qualifiedTable(call.name, call.schema)}(${argumentsSql.join(', ')}) AS [value]`,
            parameters: values
        };
    }
}
