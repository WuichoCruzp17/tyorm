
import type {
    QueryExpression,
    QueryPredicate,
    SelectQuery
} from '../ast';

import { QueryAstNormalizer } from '../normalization';

import type {
    EntityTarget,
    OrmEntityMetadata,
    OrmMetadataModel
} from '../../metadata';

import type {
    ResolvedQueryAlias,
    ResolvedColumnReference,
    ResolvedJoin,
    ResolvedSelectQuery
} from './resolved-query';

import { QuerySemanticError } from './query-semantic-error';

export class QuerySemanticResolver {
    private readonly normalizer: QueryAstNormalizer =
        new QueryAstNormalizer();

    constructor(
        private readonly metadataModel: OrmMetadataModel
    ) { }

    resolve(query: unknown): ResolvedSelectQuery {
        const normalized = this.normalizer.normalize(query);

        return this.resolveSelect(normalized);
    }

    private resolveSelect(
        query: SelectQuery
    ): ResolvedSelectQuery {
        const aliases = new Map<
            string,
            ResolvedQueryAlias
        >();

        const columns: ResolvedColumnReference[] = [];
        const joins: ResolvedJoin[] = [];

        // 1. Resolver entidad principal.
        const rootMetadata = this.getEntityMetadata(
            query.from.entity
        );

        const rootAlias: ResolvedQueryAlias =
            Object.freeze({
                alias: query.from.alias,
                metadata: rootMetadata
            });

        aliases.set(query.from.alias, rootAlias);

        // 2. Resolver relaciones JOIN.
        for (const join of query.joins) {
            const source = aliases.get(
                join.sourceAlias
            );

            if (!source) {
                throw new QuerySemanticError(
                    `Unknown source alias "${join.sourceAlias}".`
                );
            }

            const relation =
                source.metadata.relations.find(
                    item =>
                        item.propertyKey === join.relation
                );

            if (!relation) {
                throw new QuerySemanticError(
                    `Unknown relation "${join.relation}" ` +
                    `on entity ${source.metadata.entity.target.name}.`
                );
            }

            const targetConstructor = relation.target();

            const targetMetadata = this.getEntityMetadata(
                targetConstructor
            );

            const target: ResolvedQueryAlias =
                Object.freeze({
                    alias: join.alias,
                    metadata: targetMetadata
                });

            aliases.set(join.alias, target);

            joins.push(
                Object.freeze({
                    kind: 'resolved-join' as const,
                    join,
                    source,
                    target,
                    relationProperty: relation.propertyKey
                })
            );
        }

        // 3. Resolver referencias a columnas.
        const resolveExpression = (
            expression: QueryExpression
        ): void => {
            if (expression.kind !== 'column') {
                return;
            }

            const alias = aliases.get(
                expression.alias
            );

            if (!alias) {
                throw new QuerySemanticError(
                    `Unknown query alias "${expression.alias}".`
                );
            }

            const metadata = alias.metadata.entity;

            const column = metadata.columns.find(
                item =>
                    item.propertyKey === expression.property
            );

            const primaryKey = metadata.primaryKeys.find(
                item =>
                    item.propertyKey === expression.property
            );

            const physicalColumn = column ?? primaryKey;

            if (!physicalColumn) {
                throw new QuerySemanticError(
                    `Unknown property "${expression.property}" ` +
                    `on entity ${metadata.target.name}.`
                );
            }

            columns.push(
                Object.freeze({
                    kind: 'resolved-column' as const,
                    sourceAlias: expression.alias,
                    property: expression.property,
                    columnName: physicalColumn.columnName,
                    tableAlias: expression.alias
                })
            );
        };

        // 4. Recorrer predicados.
        const resolvePredicate = (
            predicate: QueryPredicate
        ): void => {
            switch (predicate.kind) {
                case 'comparison':
                    resolveExpression(predicate.left);
                    resolveExpression(predicate.right);
                    return;

                case 'logical':
                    predicate.predicates.forEach(
                        resolvePredicate
                    );
                    return;

                case 'not':
                    resolvePredicate(predicate.predicate);
                    return;

                case 'is-null':
                    resolveExpression(predicate.expression);
                    return;

                case 'in':
                    resolveExpression(predicate.expression);
                    predicate.values.forEach(
                        resolveExpression
                    );
                    return;

                case 'between':
                    resolveExpression(predicate.expression);
                    resolveExpression(predicate.lower);
                    resolveExpression(predicate.upper);
                    return;
            }
        };

        // 5. SELECT.
        query.selections.forEach(
            selection =>
                resolveExpression(selection.expression)
        );

        // 6. JOIN ON.
        query.joins.forEach(join => {
            if (join.on) {
                resolvePredicate(join.on);
            }
        });

        // 7. WHERE.
        if (query.where) {
            resolvePredicate(query.where);
        }

        // 8. ORDER BY.
        query.orderBy.forEach(order =>
            resolveExpression(order.expression)
        );

        return Object.freeze({
            kind: 'resolved-select' as const,
            query,
            aliases,
            columns: Object.freeze(columns),
            joins: Object.freeze(joins)
        });
    }

    private getEntityMetadata(
        target: EntityTarget
    ): OrmEntityMetadata {
        if (!this.metadataModel.hasEntity(target)) {
            throw new QuerySemanticError(
                `Entity "${target.name}" is not registered.`
            );
        }

        return this.metadataModel.getEntity(target);
    }
}
