import type {
    OrmEntityMetadata
} from '../../metadata/orm-entity-metadata';

import type {
    RelationMetadata,
    JoinColumnMetadata
} from '../../metadata/contracts';

import type {
    ResolvedJoinCondition
} from './resolved-join-condition';

import type {
    ResolvedJunctionJoin
} from './resolved-join-plan';

import {
    QuerySemanticError
} from './query-semantic-error';

export class JunctionJoinResolver {

    resolve(
        relation: RelationMetadata,
        sourceAlias: string,
        targetAlias: string,
        sourceMetadata: OrmEntityMetadata,
        targetMetadata: OrmEntityMetadata,
        junctionAlias: string
    ): ResolvedJunctionJoin {

        if (relation.type !== 'many-to-many') {
            throw new QuerySemanticError(
                'JunctionJoinResolver requires a ManyToMany relation.'
            );
        }

        if (
            junctionAlias === sourceAlias ||
            junctionAlias === targetAlias
        ) {
            throw new QuerySemanticError(
                `Duplicate junction alias "${junctionAlias}".`
            );
        }

        const owner = relation.isOwningSide
            ? relation
            : this.findOwningRelation(
                relation,
                sourceMetadata,
                targetMetadata
            );

        const joinTable = owner.joinTable;

        if (!joinTable) {
            throw new QuerySemanticError(
                `ManyToMany relation "${String(owner.propertyKey)}" ` +
                'has no join table.'
            );
        }

        if (
            joinTable.joinColumns.length === 0 ||
            joinTable.inverseJoinColumns.length === 0
        ) {
            throw new QuerySemanticError(
                'Junction table requires both sets of join columns.'
            );
        }

        const sourceColumns = relation.isOwningSide
            ? joinTable.joinColumns
            : joinTable.inverseJoinColumns;

        const targetColumns = relation.isOwningSide
            ? joinTable.inverseJoinColumns
            : joinTable.joinColumns;

        const sourceConditions = this.createConditions(
            sourceColumns,
            sourceAlias,
            junctionAlias,
            true
        );

        const targetConditions = this.createConditions(
            targetColumns,
            junctionAlias,
            targetAlias,
            false
        );

        return Object.freeze({
            kind: 'junction' as const,

            table: Object.freeze({
                name: joinTable.name,
                ...(joinTable.schema !== undefined
                    ? { schema: joinTable.schema }
                    : {}),
                alias: junctionAlias
            }),

            sourceConditions,
            targetConditions
        });
    }

    private findOwningRelation(
        relation: RelationMetadata,
        sourceMetadata: OrmEntityMetadata,
        targetMetadata: OrmEntityMetadata
    ): RelationMetadata {

        const inversePropertyKey =
            relation.inversePropertyKey;

        if (inversePropertyKey === undefined) {
            throw new QuerySemanticError(
                'Inverse ManyToMany relation has no inversePropertyKey.'
            );
        }

        const owner = targetMetadata.relations.find(
            candidate =>
                candidate.propertyKey === inversePropertyKey
        );

        if (
            !owner ||
            owner.type !== 'many-to-many' ||
            !owner.isOwningSide ||
            owner.target() !== sourceMetadata.entity.target
        ) {
            throw new QuerySemanticError(
                'Cannot resolve owning ManyToMany relation.'
            );
        }

        return owner;
    }

    private createConditions(
        columns: readonly JoinColumnMetadata[],
        leftAlias: string,
        rightAlias: string,
        sourceToJunction: boolean
    ): readonly ResolvedJoinCondition[] {

        return Object.freeze(
            columns.map(column =>
                Object.freeze({
                    kind: 'resolved-join-condition' as const,

                    left: Object.freeze({
                        tableAlias: leftAlias,
                        columnName: sourceToJunction
                            ? column.referencedColumnName
                            : column.name
                    }),

                    right: Object.freeze({
                        tableAlias: rightAlias,
                        columnName: sourceToJunction
                            ? column.name
                            : column.referencedColumnName
                    })
                })
            )
        );
    }
}
