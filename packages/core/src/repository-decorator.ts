import type { QueryResult } from './drivers';
import type { EntityMetadata, EntityTarget, OrmMetadataModel } from './metadata';
import type { SelectQuery } from './query';
import { Repository } from './repository';

type Execute = (query: SelectQuery) => Promise<QueryResult>;

const factories = new WeakMap<EntityTarget, (model: OrmMetadataModel, execute: Execute) => object>();

/** Associates a custom repository class with its entity. */
export function RepositoryDecorator<Entity extends object>(entity: EntityTarget<Entity>) {
    return function <Instance extends Repository<Entity>>(
        target: new (metadata: EntityMetadata<Entity>, execute: Execute) => Instance
    ): void {
        if (!(target.prototype instanceof Repository)) {
            throw new TypeError('A decorated repository must extend ReadRepository.');
        }
        factories.set(target, (model, execute) => new target(model.getEntity(entity).entity, execute));
    };
}

export function createDecoratedRepository(
    target: EntityTarget,
    model: OrmMetadataModel,
    execute: Execute
): object | undefined {
    return factories.get(target)?.(model, execute);
}
