
import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    ComparisonOperator,
    QueryPredicate,
    ResolvedSelectQuery
} from '@tyorm/core';

import {
    PostgresPredicateCompiler
} from '../src/query/compiler/postgres-predicate-compiler';

import {
    PostgresCompilationContext
} from '../src/query/compiler/postgres-compilation-context';

describe('PostgresPredicateCompiler', () => {

    const compiler = new PostgresPredicateCompiler();

    const resolved = {
        columns: [
            {
                kind: 'resolved-column',
                sourceAlias: 'u',
                property: 'firstName',
                columnName: 'first_name',
                tableAlias: 'u'
            },
            {
                kind: 'resolved-column',
                sourceAlias: 'u',
                property: 'age',
                columnName: 'age',
                tableAlias: 'u'
            }
        ]
    } satisfies Pick<ResolvedSelectQuery, 'columns'>;

    const operators = [
        ['eq', '='],
        ['ne', '<>'],
        ['gt', '>'],
        ['gte', '>='],
        ['lt', '<'],
        ['lte', '<='],
        ['like', 'LIKE'],
        ['not-like', 'NOT LIKE']
    ] as const satisfies readonly (
        readonly [ComparisonOperator, string]
    )[];

    it.each(operators)(
        'compiles %s as %s',
        (operator, sqlOperator) => {
            const context =
                new PostgresCompilationContext({
                    value: 'Luis'
                });

            const predicate: QueryPredicate = {
                kind: 'comparison',
                operator,
                left: {
                    kind: 'column',
                    alias: 'u',
                    property: 'firstName'
                },
                right: {
                    kind: 'parameter',
                    name: 'value'
                }
            };

            const sql = compiler.compile(
                predicate,
                resolved,
                context
            );

            expect(sql).toBe(
                `"u"."first_name" ${sqlOperator} $1`
            );

            expect(context.getParameters())
                .toEqual(['Luis']);
        }
    );

    it('compiles comparison with a literal', () => {
        const context =
            new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'comparison',
            operator: 'gte',
            left: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            right: {
                kind: 'literal',
                value: 18
            }
        };

        expect(
            compiler.compile(
                predicate,
                resolved,
                context
            )
        ).toBe('"u"."age" >= $1');

        expect(context.getParameters()).toEqual([18]);
    });

    it('preserves parameter order', () => {
        const context =
            new PostgresCompilationContext({
                left: 10,
                right: 20
            });

        const predicate: QueryPredicate = {
            kind: 'comparison',
            operator: 'lt',
            left: {
                kind: 'parameter',
                name: 'left'
            },
            right: {
                kind: 'parameter',
                name: 'right'
            }
        };

        expect(
            compiler.compile(
                predicate,
                resolved,
                context
            )
        ).toBe('$1 < $2');

        expect(context.getParameters()).toEqual([
            10,
            20
        ]);
    });

    it('rejects unresolved columns', () => {
        const context =
            new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'comparison',
            operator: 'eq',
            left: {
                kind: 'column',
                alias: 'u',
                property: 'missing'
            },
            right: {
                kind: 'literal',
                value: 1
            }
        };

        expect(() =>
            compiler.compile(
                predicate,
                resolved,
                context
            )
        ).toThrow(
            'Unresolved column "u.missing".'
        );
    });

    it('rejects missing named parameters', () => {
        const context =
            new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'comparison',
            operator: 'eq',
            left: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            right: {
                kind: 'parameter',
                name: 'missing'
            }
        };

        expect(() =>
            compiler.compile(
                predicate,
                resolved,
                context
            )
        ).toThrow(
            'Missing query parameter "missing".'
        );
    })


    it('compiles AND predicates', () => {
        const context = new PostgresCompilationContext({
            age: 18,
            name: 'Luis'
        });

        const predicate: QueryPredicate = {
            kind: 'logical',
            operator: 'and',
            predicates: [
                {
                    kind: 'comparison',
                    operator: 'gte',
                    left: {
                        kind: 'column',
                        alias: 'u',
                        property: 'age'
                    },
                    right: {
                        kind: 'parameter',
                        name: 'age'
                    }
                },
                {
                    kind: 'comparison',
                    operator: 'eq',
                    left: {
                        kind: 'column',
                        alias: 'u',
                        property: 'firstName'
                    },
                    right: {
                        kind: 'parameter',
                        name: 'name'
                    }
                }
            ]
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe(
            '("u"."age" >= $1 AND "u"."first_name" = $2)'
        );

        expect(context.getParameters()).toEqual([
            18,
            'Luis'
        ]);
    });

    it('compiles OR predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'logical',
            operator: 'or',
            predicates: [
                {
                    kind: 'comparison',
                    operator: 'lt',
                    left: {
                        kind: 'column',
                        alias: 'u',
                        property: 'age'
                    },
                    right: {
                        kind: 'literal',
                        value: 18
                    }
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
                        kind: 'literal',
                        value: 65
                    }
                }
            ]
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe(
            '("u"."age" < $1 OR "u"."age" > $2)'
        );

        expect(context.getParameters()).toEqual([
            18,
            65
        ]);
    });

    it('compiles NOT predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'not',
            predicate: {
                kind: 'comparison',
                operator: 'eq',
                left: {
                    kind: 'column',
                    alias: 'u',
                    property: 'age'
                },
                right: {
                    kind: 'literal',
                    value: 18
                }
            }
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('NOT ("u"."age" = $1)');

        expect(context.getParameters()).toEqual([18]);
    });

    it('compiles IS NULL', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'is-null',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'firstName'
            },
            negated: false
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."first_name" IS NULL');

        expect(context.getParameters()).toEqual([]);
    });

    it('compiles IS NOT NULL', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'is-null',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'firstName'
            },
            negated: true
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."first_name" IS NOT NULL');
    });

    it('preserves precedence in nested predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'logical',
            operator: 'and',
            predicates: [
                {
                    kind: 'logical',
                    operator: 'or',
                    predicates: [
                        {
                            kind: 'comparison',
                            operator: 'lt',
                            left: {
                                kind: 'column',
                                alias: 'u',
                                property: 'age'
                            },
                            right: {
                                kind: 'literal',
                                value: 18
                            }
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
                                kind: 'literal',
                                value: 65
                            }
                        }
                    ]
                },
                {
                    kind: 'is-null',
                    expression: {
                        kind: 'column',
                        alias: 'u',
                        property: 'firstName'
                    },
                    negated: true
                }
            ]
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe(
            '(("u"."age" < $1 OR "u"."age" > $2) AND "u"."first_name" IS NOT NULL)'
        );

        expect(context.getParameters()).toEqual([18, 65]);
    });

    it('rejects empty logical predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'logical',
            operator: 'and',
            predicates: []
        };

        expect(() =>
            compiler.compile(predicate, resolved, context)
        ).toThrow(
            'Logical predicate requires at least one predicate.'
        );
    });


    it('compiles IN predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'in',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            values: [
                { kind: 'literal', value: 18 },
                { kind: 'literal', value: 25 },
                { kind: 'literal', value: 30 }
            ],
            negated: false
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."age" IN ($1, $2, $3)');

        expect(context.getParameters()).toEqual([
            18, 25, 30
        ]);
    });

    it('compiles NOT IN predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'in',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            values: [
                { kind: 'literal', value: 18 },
                { kind: 'literal', value: 65 }
            ],
            negated: true
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."age" NOT IN ($1, $2)');

        expect(context.getParameters()).toEqual([
            18, 65
        ]);
    });

    it('compiles BETWEEN predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'between',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            lower: {
                kind: 'literal',
                value: 18
            },
            upper: {
                kind: 'literal',
                value: 65
            },
            negated: false
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."age" BETWEEN $1 AND $2');

        expect(context.getParameters()).toEqual([
            18, 65
        ]);
    });

    it('compiles NOT BETWEEN predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'between',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            lower: {
                kind: 'literal',
                value: 18
            },
            upper: {
                kind: 'literal',
                value: 65
            },
            negated: true
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."age" NOT BETWEEN $1 AND $2');

        expect(context.getParameters()).toEqual([
            18, 65
        ]);
    });

    it('rejects empty IN predicates', () => {
        const context = new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'in',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            values: [],
            negated: false
        };

        expect(() =>
            compiler.compile(predicate, resolved, context)
        ).toThrow(
            'IN predicate requires at least one value.'
        );

        expect(context.getParameters()).toEqual([]);
    });

    it('preserves parameter order in IN predicates', () => {
        const context = new PostgresCompilationContext({
            first: 18,
            second: 25
        });

        const predicate: QueryPredicate = {
            kind: 'in',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            values: [
                {
                    kind: 'parameter',
                    name: 'second'
                },
                {
                    kind: 'parameter',
                    name: 'first'
                }
            ],
            negated: false
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."age" IN ($1, $2)');

        expect(context.getParameters()).toEqual([
            25, 18
        ]);
    });

    it('preserves parameter order in BETWEEN predicates', () => {
        const context = new PostgresCompilationContext({
            minimum: 18,
            maximum: 65
        });

        const predicate: QueryPredicate = {
            kind: 'between',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'age'
            },
            lower: {
                kind: 'parameter',
                name: 'minimum'
            },
            upper: {
                kind: 'parameter',
                name: 'maximum'
            },
            negated: false
        };

        expect(
            compiler.compile(predicate, resolved, context)
        ).toBe('"u"."age" BETWEEN $1 AND $2');

        expect(context.getParameters()).toEqual([
            18, 65
        ]);
    });


});
