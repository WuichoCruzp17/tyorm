
export * from './drivers';
export const TYORM_VERSION = '0.1.0';
export * from './transactions';

export type {
    ColumnType,
    ColumnOptions,
    ColumnMetadata,
    PrimaryKeyOptions,
    PrimaryKeyMetadata,
    PrimaryKeyGenerationStrategy,
    EntityTarget,
    EntityOptions,
    EntityMetadata,
    RelationType,
    ReferentialAction,
    JoinColumnOptions,
    JoinColumnMetadata,
    JoinTableOptions,
    JoinTableMetadata,
    RelationTargetFactory,
    InverseRelationSelector,
    RelationOptions,
    RelationMetadata
} from './metadata';

export function helloTyORM(): string {
    return 'TyORM is ready!';
}

export {
    MetadataRegistry,
    MetadataError
} from './metadata';

export {
    Column,
    PrimaryKey,
    Entity,
    getEntityMetadata,
    ensureSymbolMetadata
} from './decorators';

export {
    ManyToOne,
    OneToMany,
    OneToOne,
    ManyToMany,
    JoinColumn,
    JoinTable,
    getRelationDeclarations
} from './decorators';

export type {
    EntityRelationDeclarations
} from './decorators';

export * from './query';
