
import type {
    QueryExpression,
    QueryPredicate,
    ComparisonOperator,
    ComparisonPredicate,
    LogicalPredicate,
    NotPredicate,
    IsNullPredicate,
    InPredicate,
    BetweenPredicate
} from '../ast';

import { QueryAstError } from '../errors';

const COMPARISON_OPERATORS =
    new Set<ComparisonOperator>([
        'eq',
        'ne',
        'gt',
        'gte',
        'lt',
        'lte',
        'like',
        'not-like'
    ]);

function assertExpression(
    expression: QueryExpression
): void {
    if (
        expression === null ||
        typeof expression !== 'object' ||
        !['column', 'parameter', 'literal', 'null']
            .includes(expression.kind)
    ) {
        throw new QueryAstError(
            'Invalid query expression.'
        );
    }
}

function comparison(
    operator: ComparisonOperator,
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    if (!COMPARISON_OPERATORS.has(operator)) {
        throw new QueryAstError(
            `Unsupported comparison operator: ${operator}.`
        );
    }

    assertExpression(left);
    assertExpression(right);

    if (
        left.kind === 'null' ||
        right.kind === 'null' ||
        (left.kind === 'literal' && left.value === null) ||
        (right.kind === 'literal' && right.value === null)
    ) {
        throw new QueryAstError(
            'Use isNull() or isNotNull() for NULL comparisons.'
        );
    }

    return Object.freeze({
        kind: 'comparison' as const,
        operator,
        left,
        right
    });
}

export function eq(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('eq', left, right);
}

export function ne(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('ne', left, right);
}

export function gt(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('gt', left, right);
}

export function gte(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('gte', left, right);
}

export function lt(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('lt', left, right);
}

export function lte(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('lte', left, right);
}

export function like(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('like', left, right);
}

export function notLike(
    left: QueryExpression,
    right: QueryExpression
): ComparisonPredicate {
    return comparison('not-like', left, right);
}

function logical(
    operator: 'and' | 'or',
    predicates: readonly QueryPredicate[]
): LogicalPredicate {
    if (predicates.length < 2) {
        throw new QueryAstError(
            `${operator.toUpperCase()} requires at least two predicates.`
        );
    }

    if (
        predicates.some(
            predicate =>
                predicate === null ||
                typeof predicate !== 'object' ||
                ![
                    'comparison',
                    'logical',
                    'not',
                    'is-null',
                    'in',
                    'between'
                ].includes(predicate.kind)
        )
    ) {
        throw new QueryAstError(
            'Invalid logical predicate.'
        );
    }

    return Object.freeze({
        kind: 'logical' as const,
        operator,
        predicates: Object.freeze([...predicates])
    });
}

export function and(
    ...predicates: QueryPredicate[]
): LogicalPredicate {
    return logical('and', predicates);
}

export function or(
    ...predicates: QueryPredicate[]
): LogicalPredicate {
    return logical('or', predicates);
}

export function not(
    predicate: QueryPredicate
): NotPredicate {
    if (
        predicate === null ||
        typeof predicate !== 'object' ||
        ![
            'comparison',
            'logical',
            'not',
            'is-null',
            'in',
            'between'
        ].includes(predicate.kind)
    ) {
        throw new QueryAstError(
            'Invalid predicate for NOT.'
        );
    }

    return Object.freeze({
        kind: 'not' as const,
        predicate
    });
}

export function isNull(
    expression: QueryExpression
): IsNullPredicate {
    assertExpression(expression);

    return Object.freeze({
        kind: 'is-null' as const,
        expression,
        negated: false
    });
}

export function isNotNull(
    expression: QueryExpression
): IsNullPredicate {
    assertExpression(expression);

    return Object.freeze({
        kind: 'is-null' as const,
        expression,
        negated: true
    });
}

function createIn(
    expression: QueryExpression,
    values: readonly QueryExpression[],
    negated: boolean
): InPredicate {
    assertExpression(expression);

    if (values.length === 0) {
        throw new QueryAstError(
            'IN requires at least one value.'
        );
    }

    for (const value of values) {
        assertExpression(value);
    }

    return Object.freeze({
        kind: 'in' as const,
        expression,
        values: Object.freeze([...values]),
        negated
    });
}

export function inList(
    expression: QueryExpression,
    values: readonly QueryExpression[]
): InPredicate {
    return createIn(expression, values, false);
}

export function notInList(
    expression: QueryExpression,
    values: readonly QueryExpression[]
): InPredicate {
    return createIn(expression, values, true);
}

export function between(
    expression: QueryExpression,
    lower: QueryExpression,
    upper: QueryExpression
): BetweenPredicate {
    assertExpression(expression);
    assertExpression(lower);
    assertExpression(upper);

    return Object.freeze({
        kind: 'between' as const,
        expression,
        lower,
        upper,
        negated: false
    });
}

export function notBetween(
    expression: QueryExpression,
    lower: QueryExpression,
    upper: QueryExpression
): BetweenPredicate {
    assertExpression(expression);
    assertExpression(lower);
    assertExpression(upper);

    return Object.freeze({
        kind: 'between' as const,
        expression,
        lower,
        upper,
        negated: true
    });
}
