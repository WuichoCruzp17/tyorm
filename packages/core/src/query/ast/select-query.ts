
import type {
    QueryExpression
} from './expression';

import type {
    QueryPredicate
} from './predicate';

import type { EntityTarget } from '../../metadata';

export interface QuerySource {
    readonly entity: EntityTarget;
    readonly alias: string;
}

export interface SelectItem {
    readonly expression: QueryExpression;
    readonly alias?: string;
}

export type JoinType =
    | 'inner'
    | 'left';

export interface QueryJoin {
    readonly kind: 'join';
    readonly type: JoinType;
    readonly sourceAlias: string;
    readonly relation: string;
    readonly alias: string;
    readonly on?: QueryPredicate;
}

export interface OrderByItem {
    readonly expression: QueryExpression;
    readonly direction: 'asc' | 'desc';
}

export interface SelectQuery {
    readonly kind: 'select';
    readonly from: QuerySource;
    readonly selections: readonly SelectItem[];
    readonly joins: readonly QueryJoin[];
    readonly where?: QueryPredicate;
    readonly orderBy: readonly OrderByItem[];
    readonly limit?: number;
    readonly offset?: number;
    readonly distinct: boolean;
}
