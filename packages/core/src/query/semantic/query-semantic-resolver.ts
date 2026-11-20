
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

import {
    JoinConditionResolver
} from './join-condition-resolver';

import {
    JunctionJoinResolver
} from './junction-join-resolver';

import {
    JunctionAliasGenerator
} from './junction-alias-generator';

import type {
    ResolvedJoinPlan
} from './resolved-join-plan';

import type {
    ResolvedJoinCondition
} from './resolved-join-condition';

export class QuerySemanticResolver {

    private readonly normalizer =
        new QueryAstNormalizer();

    private readonly joinConditionResolver =
        new JoinConditionResolver();

    private readonly junctionJoinResolver =
        new JunctionJoinResolver();

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

        /*
         * Reservar todos los alias declarados
         * por el usuario.
         *
         * Esto evita colisiones con los alias
         * internos de tablas intermedias.
         */
        const aliasGenerator = new JunctionAliasGenerator(
            new Set([
                query.from.alias,
                ...query.joins.map(join => join.alias)
            ])
        );

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
                    `Unknown relation "${String(join.relation)}" ` +
                    `on entity ${source.metadata.entity.target.name}.`
                );
            }

            // Evitar alias de entidad duplicados.
            if (aliases.has(join.alias)) {
                throw new QuerySemanticError(
                    `Duplicate query alias "${join.alias}".`
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

            /*
             * Resolver el plan físico.
             *
             * direct:
             *   Una unión entre dos entidades.
             *
             * junction:
             *   Dos uniones mediante una tabla
             *   intermedia.
             */
            let plan: ResolvedJoinPlan;

            if (relation.type === 'many-to-many') {

                const junctionAlias =
                    aliasGenerator.generate();

                plan = this.junctionJoinResolver.resolve(
                    relation,
                    join.sourceAlias,
                    join.alias,
                    source.metadata,
                    targetMetadata,
                    junctionAlias
                );

            } else {

                const directConditions =
                    this.joinConditionResolver.resolve(
                        relation,
                        join.sourceAlias,
                        join.alias,
                        source.metadata,
                        targetMetadata
                    );

                plan = Object.freeze({
                    kind: 'direct' as const,
                    conditions: directConditions
                });
            }

            /*
             * Mantener compatibilidad con
             * ResolvedJoin.conditions.
             *
             * Para ManyToMany, las condiciones
             * se encuentran dentro de plan.
             */
            const conditions:
                readonly ResolvedJoinCondition[] =
                plan.kind === 'direct'
                    ? plan.conditions
                    : Object.freeze([]);

            /*
             * Registrar el alias solo después
             * de resolver el JOIN.
             */
            aliases.set(join.alias, target);

            joins.push(
                Object.freeze({
                    kind: 'resolved-join' as const,
                    join,
                    source,
                    target,
                    relationProperty: relation.propertyKey,
                    conditions,
                    plan
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

        // 4. Resolver predicados.
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

        // 8. GROUP BY.
        query.groupBy?.forEach(resolveExpression);

        // 9. ORDER BY.
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
