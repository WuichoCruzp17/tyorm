
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

    it('rejects unsupported predicate kinds', () => {
        const context =
            new PostgresCompilationContext();

        const predicate: QueryPredicate = {
            kind: 'is-null',
            expression: {
                kind: 'column',
                alias: 'u',
                property: 'firstName'
            },
            negated: false
        };

        expect(() =>
            compiler.compile(
                predicate,
                resolved,
                context
            )
        ).toThrow(
            'Unsupported predicate kind: is-null.'
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
    });
});
