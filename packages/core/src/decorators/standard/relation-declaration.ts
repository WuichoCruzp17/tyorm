
import type {
    InverseRelationReference,
    JoinColumnOptions,
    JoinTableOptions,
    RelationOptions,
    RelationTargetFactory,
    RelationType
} from '../../metadata/contracts';

export interface RelationDeclaration<
    T extends object = object
> {
    readonly propertyKey: string | symbol;
    readonly type: RelationType;
    readonly target: RelationTargetFactory<T>;
    readonly inverse?: InverseRelationReference<T>;
    readonly options: RelationOptions;
}

export interface JoinColumnDeclaration {
    readonly propertyKey: string | symbol;
    readonly columns: readonly JoinColumnOptions[];
}

export interface JoinTableDeclaration {
    readonly propertyKey: string | symbol;
    readonly options: JoinTableOptions;
}
