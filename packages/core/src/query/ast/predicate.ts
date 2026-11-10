
import type {
    QueryExpression
} from './expression';

export type ComparisonOperator =
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'like'
    | 'not-like';

export interface ComparisonPredicate {
    readonly kind: 'comparison';
    readonly operator: ComparisonOperator;
    readonly left: QueryExpression;
    readonly right: QueryExpression;
}

export interface LogicalPredicate {
    readonly kind: 'logical';
    readonly operator: 'and' | 'or';
    readonly predicates: readonly QueryPredicate[];
}

export interface NotPredicate {
    readonly kind: 'not';
    readonly predicate: QueryPredicate;
}

export interface IsNullPredicate {
    readonly kind: 'is-null';
    readonly expression: QueryExpression;
    readonly negated: boolean;
}

export interface InPredicate {
    readonly kind: 'in';
    readonly expression: QueryExpression;
    readonly values: readonly QueryExpression[];
    readonly negated: boolean;
}

export interface BetweenPredicate {
    readonly kind: 'between';
    readonly expression: QueryExpression;
    readonly lower: QueryExpression;
    readonly upper: QueryExpression;
    readonly negated: boolean;
}

export type QueryPredicate =
    | ComparisonPredicate
    | LogicalPredicate
    | NotPredicate
    | IsNullPredicate
    | InPredicate
    | BetweenPredicate;
