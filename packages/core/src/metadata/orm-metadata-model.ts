
import type {
    EntityMetadata,
    EntityTarget
} from './contracts';

import { MetadataError } from './metadata-error';

import {
    RelationMetadataResolver
} from './relation-metadata-resolver';

import type {
    OrmEntityMetadata
} from './orm-entity-metadata';

import {
    OrmMetadataValidator
} from './orm-metadata-validator';

import { MetadataRegistry } from './metadata-registry';

import { freezeOrmEntityMetadata } from './immutable-metadata';

export class OrmMetadataModel {
    private readonly entities =
        new Map<EntityTarget, OrmEntityMetadata>();


    constructor(
        entityMetadata: readonly EntityMetadata<any>[]
    ) {
        const resolver = new RelationMetadataResolver(
            entityMetadata
        );

        for (const metadata of entityMetadata) {
            const resolved = resolver.resolve(
                metadata.target
            );

            const ormEntity: OrmEntityMetadata =
                freezeOrmEntityMetadata({
                    entity: metadata,
                    relations: resolved.relations
                });

            this.entities.set(
                metadata.target,
                ormEntity
            );
        }

        const validator = new OrmMetadataValidator();

        validator.validate(this.getEntities());
    }


    getEntity<T extends object>(
        target: EntityTarget<T>
    ): OrmEntityMetadata<T> {
        const metadata = this.entities.get(target);

        if (!metadata) {
            throw new MetadataError(
                `ORM entity "${target.name}" is not registered.`
            );
        }

        return metadata as OrmEntityMetadata<T>;
    }

    hasEntity(
        target: EntityTarget
    ): boolean {
        return this.entities.has(target);
    }

    getEntities(): readonly OrmEntityMetadata[] {
        return Object.freeze(
            [...this.entities.values()]
        );
    }


    static fromRegistry(
        registry: MetadataRegistry
    ): OrmMetadataModel {
        return new OrmMetadataModel(
            registry.getAll()
        );
    }

}
