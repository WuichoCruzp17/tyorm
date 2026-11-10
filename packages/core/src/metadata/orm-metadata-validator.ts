
import type {
    EntityMetadata,
    RelationMetadata
} from './contracts';

import type {
    OrmEntityMetadata
} from './orm-entity-metadata';

import { MetadataError } from './metadata-error';

export class OrmMetadataValidator {

    validate(
        entities: readonly OrmEntityMetadata[]
    ): void {
        const occupiedTables = new Map<string, string>();

        // 1. Registrar tablas de entidades.
        for (const item of entities) {
            const entity = item.entity;

            const key = this.tableKey(
                entity.schema,
                entity.tableName
            );

            const owner = `entity ${entity.target.name}`;

            this.registerTable(
                occupiedTables,
                key,
                owner,
                this.qualifiedName(
                    entity.schema,
                    entity.tableName
                )
            );
        }

        // 2. Registrar tablas intermedias.
        for (const item of entities) {
            for (const relation of item.relations) {
                if (!relation.isOwningSide) {
                    continue;
                }

                if (relation.type !== 'many-to-many') {
                    continue;
                }

                const joinTable = relation.joinTable;

                if (!joinTable) {
                    throw new MetadataError(
                        `Owning ManyToMany relation ` +
                        `${item.entity.target.name}.` +
                        `${String(relation.propertyKey)} ` +
                        `requires a join table.`
                    );
                }

                const schema =
                    joinTable.schema ?? item.entity.schema;

                const key = this.tableKey(
                    schema,
                    joinTable.name
                );

                const owner =
                    `relation ${item.entity.target.name}.` +
                    String(relation.propertyKey);

                this.registerTable(
                    occupiedTables,
                    key,
                    owner,
                    this.qualifiedName(
                        schema,
                        joinTable.name
                    )
                );

                this.validateJoinTableColumns(
                    item.entity,
                    relation
                );
            }
        }
    }

    private registerTable(
        occupied: Map<string, string>,
        key: string,
        owner: string,
        qualifiedName: string
    ): void {
        const previous = occupied.get(key);

        if (previous !== undefined) {
            throw new MetadataError(
                `Duplicate physical table "${qualifiedName}". ` +
                `Used by ${previous} and ${owner}.`
            );
        }

        occupied.set(key, owner);
    }

    private validateJoinTableColumns(
        source: EntityMetadata<any>,
        relation: RelationMetadata
    ): void {
        const joinTable = relation.joinTable;

        if (!joinTable) {
            return;
        }

        const names = new Set<string>();

        for (const column of [
            ...joinTable.joinColumns,
            ...joinTable.inverseJoinColumns
        ]) {
            if (names.has(column.name)) {
                throw new MetadataError(
                    `Duplicate join table column ` +
                    `"${column.name}" in ` +
                    `${source.target.name}.` +
                    `${String(relation.propertyKey)}.`
                );
            }

            names.add(column.name);
        }
    }

    private tableKey(
        schema: string | undefined,
        name: string
    ): string {
        return JSON.stringify([
            schema ?? null,
            name
        ]);
    }

    private qualifiedName(
        schema: string | undefined,
        name: string
    ): string {
        return schema === undefined
            ? name
            : `${schema}.${name}`;
    }
}
