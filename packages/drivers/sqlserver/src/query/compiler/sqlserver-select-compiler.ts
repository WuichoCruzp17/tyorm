import type {
    CompiledQuery,
    FunctionCall,
    ProcedureCall,
    QueryExpression,
    QueryPredicate,
    ResolvedJoinColumn,
    ResolvedJoinCondition,
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

    compileProcedure(call: ProcedureCall): CompiledQuery {
        const values: unknown[] = [];
        const argumentsSql = (call.args ?? []).map(argument => {
            if (typeof argument === 'object' && argument !== null && 'mode' in argument) {
                if (argument.mode === 'out' || argument.mode === 'inout') {
                    throw new Error('SQL Server OUT and INOUT procedure parameters are not supported yet.');
                }
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
