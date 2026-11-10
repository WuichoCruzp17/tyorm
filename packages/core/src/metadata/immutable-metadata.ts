
import type { EntityMetadata } from './contracts/entity-metadata';
import type { RelationMetadata } from './contracts/relation-metadata';
import type { OrmEntityMetadata } from './orm-entity-metadata';

export function freezeEntityMetadata<T extends object>(
    metadata: EntityMetadata<T>
): EntityMetadata<T> {
    return Object.freeze({
        ...metadata,

        columns: Object.freeze(
            metadata.columns.map(column =>
                Object.freeze({ ...column })
            )
        ),

        primaryKeys: Object.freeze(
            metadata.primaryKeys.map(primaryKey =>
                Object.freeze({ ...primaryKey })
            )
        )
    });
}

export function freezeRelationMetadata(
    relation: RelationMetadata
): RelationMetadata {
    const joinColumns = Object.freeze(
        relation.joinColumns.map(column =>
            Object.freeze({ ...column })
        )
    );

    const joinTable = relation.joinTable
        ? Object.freeze({
            ...relation.joinTable,

            joinColumns: Object.freeze(
                relation.joinTable.joinColumns.map(
                    column => Object.freeze({ ...column })
                )
            ),

            inverseJoinColumns: Object.freeze(
                relation.joinTable.inverseJoinColumns.map(
                    column => Object.freeze({ ...column })
                )
            )
        })
        : undefined;

    return Object.freeze({
        ...relation,
        joinColumns,
        ...(joinTable === undefined
            ? {}
            : { joinTable })
    });
}

export function freezeOrmEntityMetadata<T extends object>(
    metadata: OrmEntityMetadata<T>
): OrmEntityMetadata<T> {
    return Object.freeze({
        entity: freezeEntityMetadata(metadata.entity),

        relations: Object.freeze(
            metadata.relations.map(
                freezeRelationMetadata
            )
        )
    });
}
