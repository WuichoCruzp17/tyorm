
import type {
    RelationMetadata
} from './contracts';

export function freezeRelationMetadata(
    relation: RelationMetadata
): RelationMetadata {
    const joinColumns = Object.freeze(
        relation.joinColumns.map(column =>
            Object.freeze({ ...column })
        )
    );

    const joinTable = relation.joinTable === undefined
        ? undefined
        : Object.freeze({
            ...relation.joinTable,

            joinColumns: Object.freeze(
                relation.joinTable.joinColumns.map(column =>
                    Object.freeze({ ...column })
                )
            ),

            inverseJoinColumns: Object.freeze(
                relation.joinTable.inverseJoinColumns.map(column =>
                    Object.freeze({ ...column })
                )
            )
        });

    return Object.freeze({
        ...relation,
        joinColumns,
        ...(joinTable !== undefined ? { joinTable } : {})
    });
}
