import type {
    OrmEntityMetadata
} from '../../metadata/orm-entity-metadata';

import type {
    RelationMetadata
} from '../../metadata/contracts';

import type {
    ResolvedJoinCondition
} from './resolved-join-condition';

import {
    QuerySemanticError
} from './query-semantic-error';

export class JoinConditionResolver {

    resolve(
        relation: RelationMetadata,
        sourceAlias: string,
        targetAlias: string,
        sourceMetadata?: OrmEntityMetadata,
        targetMetadata?: OrmEntityMetadata
    ): readonly ResolvedJoinCondition[] {

        if (relation.type === 'many-to-many') {
            throw new QuerySemanticError(
                'ManyToMany JOIN resolution requires a join table.'
            );
        }

        if (relation.isOwningSide) {
            return this.resolveOwning(
                relation,
                sourceAlias,
                targetAlias
            );
        }

        if (!sourceMetadata || !targetMetadata) {
            throw new QuerySemanticError(
                `Inverse relation "${String(relation.propertyKey)}" ` +
                'requires source and target metadata.'
            );
        }

        return this.resolveInverse(
            relation,
            sourceAlias,
            targetAlias,
            sourceMetadata,
            targetMetadata
        );
    }

    private resolveOwning(
        relation: RelationMetadata,
        sourceAlias: string,
        targetAlias: string
    ): readonly ResolvedJoinCondition[] {

        if (relation.joinColumns.length === 0) {
            throw new QuerySemanticError(
                `Relation "${String(relation.propertyKey)}" ` +
                'has no join columns.'
            );
        }

        return Object.freeze(
            relation.joinColumns.map(column =>
                Object.freeze({
                    kind: 'resolved-join-condition' as const,

                    left: Object.freeze({
                        tableAlias: sourceAlias,
                        columnName: column.name
                    }),

                    right: Object.freeze({
                        tableAlias: targetAlias,
                        columnName: column.referencedColumnName
                    })
                })
            )
        );
    }

    private resolveInverse(
        relation: RelationMetadata,
        sourceAlias: string,
        targetAlias: string,
        sourceMetadata: OrmEntityMetadata,
        targetMetadata: OrmEntityMetadata
    ): readonly ResolvedJoinCondition[] {

        const inversePropertyKey =
            relation.inversePropertyKey;

        if (inversePropertyKey === undefined) {
            throw new QuerySemanticError(
                `Inverse relation "${String(relation.propertyKey)}" ` +
                'does not declare inversePropertyKey.'
            );
        }

        const owningRelation =
            targetMetadata.relations.find(
                candidate =>
                    candidate.propertyKey === inversePropertyKey
            );

        if (!owningRelation) {
            throw new QuerySemanticError(
                `Owning relation "${String(inversePropertyKey)}" ` +
                `was not found on ${targetMetadata.entity.target.name}.`
            );
        }

        if (!owningRelation.isOwningSide) {
            throw new QuerySemanticError(
                `Relation "${String(inversePropertyKey)}" ` +
                'is not the owning side.'
            );
        }

        if (
            owningRelation.target() !==
            sourceMetadata.entity.target
        ) {
            throw new QuerySemanticError(
                'Owning relation targets a different entity.'
            );
        }

        if (owningRelation.joinColumns.length === 0) {
            throw new QuerySemanticError(
                'Owning relation has no join columns.'
            );
        }

        return Object.freeze(
            owningRelation.joinColumns.map(column =>
                Object.freeze({
                    kind: 'resolved-join-condition' as const,

                    left: Object.freeze({
                        tableAlias: sourceAlias,
                        columnName: column.referencedColumnName
                    }),

                    right: Object.freeze({
                        tableAlias: targetAlias,
                        columnName: column.name
                    })
                })
            )
        );
    }
}
