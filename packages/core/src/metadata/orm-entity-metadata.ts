import type {
    EntityMetadata,
    RelationMetadata
} from './contracts';

export interface OrmEntityMetadata<T extends object = any> {
    readonly entity: EntityMetadata<T>;
    readonly relations: readonly RelationMetadata[];
}
