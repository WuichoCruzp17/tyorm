
import type {
    QueryAst,
    QueryExpression,
    QueryPredicate,
    SelectQuery
} from '../ast';

import { QueryAstError } from '../errors';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const COMPARISONS = new Set([
    'eq', 'ne', 'gt', 'gte',
    'lt', 'lte', 'like', 'not-like'
]);

const AGGREGATES = new Set<unknown>(['count', 'sum', 'avg', 'min', 'max']);

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value)
    ) {
        throw new QueryAstError('Expected an AST object.');
    }

    return value as RecordValue;
}

function identifier(
    value: unknown,
    label: string
): string {
    if (
        typeof value !== 'string' ||
        !IDENTIFIER.test(value)
    ) {
        throw new QueryAstError(
            `Invalid ${label}: ${String(value)}.`
        );
    }

    return value;
}

function booleanValue(
    value: unknown,
    label: string
): void {
    if (typeof value !== 'boolean') {
        throw new QueryAstError(
            `${label} must be a boolean.`
        );
    }
}

function nonNegativeInteger(
    value: unknown,
    label: string
): void {
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new QueryAstError(
            `${label} must be a non-negative safe integer.`
        );
    }
}

function literalValue(value: unknown): void {
    const valid =
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        (typeof value === 'number' &&
            Number.isFinite(value)) ||
        (value instanceof Date &&
            !Number.isNaN(value.getTime())) ||
        value instanceof Uint8Array;

    if (!valid) {
        throw new QueryAstError(
            'Invalid literal value.'
        );
    }
}

export class QueryAstValidator {
    private readonly active = new WeakSet<object>();

    private visit(
        value: unknown,
        callback: (node: RecordValue) => void
    ): void {
        const node = record(value);

        if (this.active.has(node)) {
            throw new QueryAstError(
                'Circular AST reference detected.'
            );
        }

        this.active.add(node);

        try {
            callback(node);
        } finally {
            this.active.delete(node);
        }
    }

    validateExpression(
        expression: unknown
    ): asserts expression is QueryExpression {
        this.visit(expression, node => {
            switch (node.kind) {
                case 'column':
                    identifier(node.alias, 'column alias');
                    identifier(node.property, 'column property');
                    return;

                case 'aggregate': {
                    if (!AGGREGATES.has(node.function)) {
                        throw new QueryAstError('Unknown aggregate function.');
                    }

                    if (node.argument === undefined && node.function === 'count') {
                        return;
                    }
                    if (node.argument === undefined || record(node.argument).kind !== 'column') {
                        throw new QueryAstError('Aggregate requires a column argument.');
                    }

                    this.validateExpression(node.argument);
                    return;
                }

                case 'parameter':
                    identifier(node.name, 'parameter name');
                    return;

                case 'literal':
                    literalValue(node.value);
                    return;

                case 'null':
                    return;

                default:
                    throw new QueryAstError(
                        `Unknown expression kind: ${String(node.kind)}.`
                    );
            }
        });
    }

    validatePredicate(
        predicate: unknown
    ): asserts predicate is QueryPredicate {
        this.visit(predicate, node => {
            switch (node.kind) {
                case 'comparison': {
                    if (!COMPARISONS.has(node.operator as string)) {
                        throw new QueryAstError(
                            'Invalid comparison operator.'
                        );
                    }

                    this.validateExpression(node.left);
                    this.validateExpression(node.right);

                    const left = node.left as QueryExpression;
                    const right = node.right as QueryExpression;

                    const isNull = (value: QueryExpression) =>
                        value.kind === 'null' ||
                        (value.kind === 'literal' &&
                            value.value === null);

                    if (isNull(left) || isNull(right)) {
                        throw new QueryAstError(
                            'Use IS NULL instead of NULL comparison.'
                        );
                    }

                    return;
                }

                case 'logical': {
                    if (
                        node.operator !== 'and' &&
                        node.operator !== 'or'
                    ) {
                        throw new QueryAstError(
                            'Invalid logical operator.'
                        );
                    }

                    if (
                        !Array.isArray(node.predicates) ||
                        node.predicates.length < 2
                    ) {
                        throw new QueryAstError(
                            'Logical predicate requires at least two operands.'
                        );
                    }

                    for (const child of node.predicates) {
                        this.validatePredicate(child);
                    }

                    return;
                }

                case 'not':
                    this.validatePredicate(node.predicate);
                    return;

                case 'is-null':
                    this.validateExpression(node.expression);
                    booleanValue(node.negated, 'negated');
                    return;

                case 'in':
                    this.validateExpression(node.expression);

                    if (
                        !Array.isArray(node.values) ||
                        node.values.length === 0
                    ) {
                        throw new QueryAstError(
                            'IN requires at least one value.'
                        );
                    }

                    for (const value of node.values) {
                        this.validateExpression(value);
                    }

                    booleanValue(node.negated, 'negated');
                    return;

                case 'between':
                    this.validateExpression(node.expression);
                    this.validateExpression(node.lower);
                    this.validateExpression(node.upper);
                    booleanValue(node.negated, 'negated');
                    return;

                default:
                    throw new QueryAstError(
                        `Unknown predicate kind: ${String(node.kind)}.`
                    );
            }
        });
    }

    validateSelect(
        query: unknown
    ): asserts query is SelectQuery {
        this.visit(query, node => {
            if (node.kind !== 'select') {
                throw new QueryAstError(
                    'Expected SELECT query.'
                );
            }

            const from = record(node.from);
            identifier(from.alias, 'FROM alias');

            if (typeof from.entity !== 'function') {
                throw new QueryAstError(
                    'FROM entity must be a constructor.'
                );
            }

            const aliases = new Set<string>([
                from.alias as string
            ]);

            if (!Array.isArray(node.joins)) {
                throw new QueryAstError(
                    'JOIN collection must be an array.'
                );
            }

            // Los JOIN se procesan en orden:
            // cada origen debe haber sido declarado previamente.
            for (const item of node.joins) {
                const join = record(item);

                if (join.kind !== 'join') {
                    throw new QueryAstError(
                        'Invalid JOIN node.'
                    );
                }

                if (
                    join.type !== 'inner' &&
                    join.type !== 'left'
                ) {
                    throw new QueryAstError(
                        'Invalid JOIN type.'
                    );
                }

                const sourceAlias = identifier(
                    join.sourceAlias,
                    'JOIN source alias'
                );

                const alias = identifier(
                    join.alias,
                    'JOIN alias'
                );

                identifier(join.relation, 'JOIN relation');

                if (!aliases.has(sourceAlias)) {
                    throw new QueryAstError(
                        `Unknown JOIN source alias: ${sourceAlias}.`
                    );
                }

                if (aliases.has(alias)) {
                    throw new QueryAstError(
                        `Duplicate query alias: ${alias}.`
                    );
                }

                aliases.add(alias);
            }

            let hasAggregate = false;
            const checkExpression = (value: unknown, clause?: 'WHERE' | 'JOIN ON') => {
                this.validateExpression(value);

                if (value.kind === 'aggregate') {
                    if (clause !== undefined) {
                        throw new QueryAstError(`Aggregates are not allowed in ${clause}.`);
                    }

                    hasAggregate = true;
                }

                const column = value.kind === 'aggregate' ? value.argument : value;
                if (column?.kind === 'column' && !aliases.has(column.alias)) {
                    throw new QueryAstError(`Unknown column alias: ${column.alias}.`);
                }
            };

            const checkPredicate = (value: unknown, clause?: 'WHERE' | 'JOIN ON'): void => {
                this.validatePredicate(value);
                const check = (expression: QueryExpression) => checkExpression(expression, clause);
                const walk = (predicate: QueryPredicate): void => {
                    switch (predicate.kind) {
                        case 'comparison':
                            check(predicate.left);
                            check(predicate.right);
                            return;

                        case 'logical':
                            predicate.predicates.forEach(walk);
                            return;

                        case 'not':
                            walk(predicate.predicate);
                            return;

                        case 'is-null':
                            check(predicate.expression);
                            return;

                        case 'in':
                            check(predicate.expression);
                            predicate.values.forEach(check);
                            return;

                        case 'between':
                            check(predicate.expression);
                            check(predicate.lower);
                            check(predicate.upper);
                            return;
                    }
                };

                walk(value);
            };

            // Validar JOIN ON una vez conocidos todos los alias.
            for (const item of node.joins) {
                const join = record(item);

                if (join.on !== undefined) {
                    checkPredicate(join.on, 'JOIN ON');
                }
            }

            if (!Array.isArray(node.selections)) {
                throw new QueryAstError(
                    'SELECT selections must be an array.'
                );
            }

            const selectionAliases = new Set<string>();

            for (const item of node.selections) {
                const selection = record(item);

                checkExpression(selection.expression);

                if (selection.alias !== undefined) {
                    const alias = identifier(
                        selection.alias,
                        'selection alias'
                    );

                    if (selectionAliases.has(alias)) {
                        throw new QueryAstError(
                            `Duplicate selection alias: ${alias}.`
                        );
                    }

                    selectionAliases.add(alias);
                }
            }

            if (node.where !== undefined) {
                checkPredicate(node.where, 'WHERE');
            }

            if (node.groupBy !== undefined) {
                if (!Array.isArray(node.groupBy)) {
                    throw new QueryAstError('GROUP BY must be an array.');
                }

                for (const expression of node.groupBy) {
                    if (record(expression).kind !== 'column') {
                        throw new QueryAstError('GROUP BY requires column expressions.');
                    }
                    checkExpression(expression);
                }
            }

            if (node.having !== undefined) {
                checkPredicate(node.having);
            }

            if (!Array.isArray(node.orderBy)) {
                throw new QueryAstError(
                    'ORDER BY must be an array.'
                );
            }

            for (const item of node.orderBy) {
                const order = record(item);

                checkExpression(order.expression);

                if (
                    order.direction !== 'asc' &&
                    order.direction !== 'desc'
                ) {
                    throw new QueryAstError(
                        'Invalid ORDER BY direction.'
                    );
                }
            }

            if (
                node.having !== undefined && !hasAggregate &&
                (!Array.isArray(node.groupBy) || node.groupBy.length === 0)
            ) {
                throw new QueryAstError('HAVING requires grouping columns or an aggregate.');
            }

            if (node.limit !== undefined) {
                nonNegativeInteger(node.limit, 'LIMIT');
            }

            if (node.offset !== undefined) {
                nonNegativeInteger(node.offset, 'OFFSET');
            }

            booleanValue(node.distinct, 'DISTINCT');
        });
    }

    validate(
        query: unknown
    ): asserts query is QueryAst {
        this.validateSelect(query);
    }
}
