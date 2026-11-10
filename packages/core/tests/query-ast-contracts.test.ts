
import { describe, expect, it } from 'vitest';

import type {
    ColumnExpression,
    ParameterExpression,
    ComparisonPredicate,
    LogicalPredicate,
    SelectQuery,
    QueryAst
} from '../src/query';

describe('Query AST contracts', () => {
    it('should represent a column expression', () => {
        const column: ColumnExpression = {
            kind: 'column',
            alias: 'u',
            property: 'name'
        };

        expect(column.kind).toBe('column');
        expect(column.alias).toBe('u');
        expect(column.property).toBe('name');
    });

    it('should represent a named parameter', () => {
        const parameter: ParameterExpression = {
            kind: 'parameter',
            name: 'status'
        };

        expect(parameter.kind).toBe('parameter');
        expect(parameter.name).toBe('status');
    });

    it('should represent a comparison predicate', () => {
        const predicate: ComparisonPredicate = {
            kind: 'comparison',
            operator: 'eq',
            left: {
                kind: 'column',
                alias: 'u',
                property: 'status'
            },
            right: {
                kind: 'parameter',
                name: 'status'
            }
        };

        expect(predicate.operator).toBe('eq');
        expect(predicate.left.kind).toBe('column');
        expect(predicate.right.kind).toBe('parameter');
    });

    it('should represent nested logical predicates', () => {
        const predicate: LogicalPredicate = {
            kind: 'logical',
            operator: 'and',
            predicates: [
                {
                    kind: 'comparison',
                    operator: 'eq',
                    left: {
                        kind: 'column',
                        alias: 'u',
                        property: 'status'
                    },
                    right: {
                        kind: 'parameter',
                        name: 'status'
                    }
                },
                {
                    kind: 'logical',
                    operator: 'or',
                    predicates: [
                        {
                            kind: 'is-null',
                            expression: {
                                kind: 'column',
                                alias: 'u',
                                property: 'deletedAt'
                            },
                            negated: false
                        },
                        {
                            kind: 'comparison',
                            operator: 'gt',
                            left: {
                                kind: 'column',
                                alias: 'u',
                                property: 'age'
                            },
                            right: {
                                kind: 'parameter',
                                name: 'minimumAge'
                            }
                        }
                    ]
                }
            ]
        };

        expect(predicate.predicates).toHaveLength(2);
        expect(predicate.predicates[1]?.kind)
            .toBe('logical');
    });

    it('should represent a SELECT query', () => {
        class User { }

        const query: SelectQuery = {
            kind: 'select',
            from: {
                entity: User,
                alias: 'u'
            },
            selections: [
                {
                    expression: {
                        kind: 'column',
                        alias: 'u',
                        property: 'id'
                    }
                },
                {
                    expression: {
                        kind: 'column',
                        alias: 'u',
                        property: 'name'
                    }
                }
            ],
            joins: [],
            where: {
                kind: 'comparison',
                operator: 'eq',
                left: {
                    kind: 'column',
                    alias: 'u',
                    property: 'status'
                },
                right: {
                    kind: 'parameter',
                    name: 'status'
                }
            },
            orderBy: [
                {
                    expression: {
                        kind: 'column',
                        alias: 'u',
                        property: 'name'
                    },
                    direction: 'asc'
                }
            ],
            limit: 20,
            offset: 0,
            distinct: false
        };

        expect(query.kind).toBe('select');
        expect(query.selections).toHaveLength(2);
        expect(query.joins).toHaveLength(0);
        expect(query.limit).toBe(20);
        expect(query.where?.kind).toBe('comparison');
    });

    it('should support discriminated query AST types', () => {
        class User { }

        const query: QueryAst = {
            kind: 'select',
            from: {
                entity: User,
                alias: 'u'
            },
            selections: [],
            joins: [],
            orderBy: [],
            distinct: false
        };

        switch (query.kind) {
            case 'select':
                expect(query.from.alias).toBe('u');
                break;
        }
    });
});
