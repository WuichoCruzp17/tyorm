
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
    EntityMetadata
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
