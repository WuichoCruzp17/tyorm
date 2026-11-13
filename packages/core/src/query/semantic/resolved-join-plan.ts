import type {
    ResolvedJoinCondition
} from './resolved-join-condition';

export interface ResolvedDirectJoin {
    readonly kind: 'direct';
    readonly conditions: readonly ResolvedJoinCondition[];
}

export interface ResolvedJunctionTable {
    readonly name: string;
    readonly schema?: string;
    readonly alias: string;
}

export interface ResolvedJunctionJoin {
    readonly kind: 'junction';
    readonly table: ResolvedJunctionTable;

    readonly sourceConditions:
        readonly ResolvedJoinCondition[];

    readonly targetConditions:
        readonly ResolvedJoinCondition[];
}

export type ResolvedJoinPlan =
    | ResolvedDirectJoin
    | ResolvedJunctionJoin;
