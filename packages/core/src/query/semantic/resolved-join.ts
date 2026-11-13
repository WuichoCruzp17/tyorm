import type {
    OrmEntityMetadata
} from '../../metadata/orm-entity-metadata';

export interface ResolvedJoinColumn {
    readonly sourceColumn: string;
    readonly targetColumn: string;
}

export interface ResolvedJoin {
    readonly type: 'inner' | 'left';

    readonly sourceAlias: string;
    readonly targetAlias: string;

    readonly sourceEntity: OrmEntityMetadata;
    readonly targetEntity: OrmEntityMetadata;

    readonly relationProperty: string;

    readonly columns: readonly ResolvedJoinColumn[];
}
