export interface ResolvedJoinColumn {
    readonly tableAlias: string;
    readonly columnName: string;
}

export interface ResolvedJoinCondition {
    readonly kind: 'resolved-join-condition';

    readonly left: ResolvedJoinColumn;
    readonly right: ResolvedJoinColumn;
}
