
import type {
    QueryAst,
    QueryExpression,
    QueryPredicate,
    SelectQuery
} from '../ast';

import { QueryAstValidator } from '../validation';

function cloneExpression(
    expression: QueryExpression
): QueryExpression {
    switch (expression.kind) {
        case 'column':
            return Object.freeze({ ...expression });

        case 'vector-distance':
            return Object.freeze({
                ...expression,
                column: Object.freeze({ ...expression.column }),
                vector: Object.freeze([...expression.vector])
            });

        case 'aggregate':
            return expression.argument === undefined
                ? Object.freeze({ ...expression })
                : Object.freeze({
                    ...expression,
                    argument: Object.freeze({ ...expression.argument })
                });

        case 'parameter':
            return Object.freeze({ ...expression });

        case 'null':
            return Object.freeze({ ...expression });

        case 'literal': {
            const value = expression.value;

            const snapshot =
                value instanceof Date
                    ? new Date(value.getTime())
                    : value instanceof Uint8Array
                        ? new Uint8Array(value)
                        : value;

            return Object.freeze({
                kind: 'literal' as const,
                value: snapshot
            });
        }
    }
}

function clonePredicate(
    predicate: QueryPredicate
): QueryPredicate {
    switch (predicate.kind) {
        case 'comparison':
            return Object.freeze({
                ...predicate,
                left: cloneExpression(predicate.left),
                right: cloneExpression(predicate.right)
            });

        case 'logical': {
            const children = predicate.predicates.map(
                clonePredicate
            );

            const flattened: QueryPredicate[] = [];

            for (const child of children) {
                if (
                    child.kind === 'logical' &&
                    child.operator === predicate.operator
                ) {
                    flattened.push(...child.predicates);
                } else {
                    flattened.push(child);
                }
            }

            return Object.freeze({
                kind: 'logical' as const,
                operator: predicate.operator,
                predicates: Object.freeze(flattened)
            });
        }

        case 'not':
            return Object.freeze({
                kind: 'not' as const,
                predicate: clonePredicate(predicate.predicate)
            });

        case 'is-null':
            return Object.freeze({
                ...predicate,
                expression: cloneExpression(
                    predicate.expression
                )
            });

        case 'in':
            return Object.freeze({
                ...predicate,
                expression: cloneExpression(
                    predicate.expression
                ),
                values: Object.freeze(
                    predicate.values.map(cloneExpression)
                )
            });

        case 'between':
            return Object.freeze({
                ...predicate,
                expression: cloneExpression(
                    predicate.expression
                ),
                lower: cloneExpression(predicate.lower),
                upper: cloneExpression(predicate.upper)
            });
    }
}

export class QueryAstNormalizer {
    private readonly validator: QueryAstValidator =
        new QueryAstValidator();

    normalize(query: unknown): QueryAst {
        this.validator.validate(query);

        return this.normalizeSelect(query);
    }

    private normalizeSelect(
        query: SelectQuery
    ): SelectQuery {
        return Object.freeze({
            kind: 'select' as const,

            from: Object.freeze({
                ...query.from
            }),

            selections: Object.freeze(
                query.selections.map(selection =>
                    Object.freeze({
                        ...selection,
                        expression: cloneExpression(
                            selection.expression
                        )
                    })
                )
            ),

            joins: Object.freeze(
                query.joins.map(join =>
                    Object.freeze({
                        ...join,
                        ...(join.on === undefined
                            ? {}
                            : {
                                on: clonePredicate(join.on)
                            })
                    })
                )
            ),

            ...(query.where === undefined
                ? {}
                : {
                    where: clonePredicate(query.where)
                }),

            ...(query.groupBy === undefined
                ? {}
                : {
                    groupBy: Object.freeze(query.groupBy.map(expression =>
                        Object.freeze({ ...expression })
                    ))
                }),
            ...(query.having === undefined
                ? {}
                : { having: clonePredicate(query.having) }),

            orderBy: Object.freeze(
                query.orderBy.map(order =>
                    Object.freeze({
                        ...order,
                        expression: cloneExpression(
                            order.expression
                        )
                    })
                )
            ),

            ...(query.limit === undefined
                ? {}
                : { limit: query.limit }),

            ...(query.offset === undefined
                ? {}
                : { offset: query.offset }),

            distinct: query.distinct
        });
    }
}
