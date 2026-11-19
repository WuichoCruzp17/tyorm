
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    Column,
    QuerySemanticResolver,
    column,
    getEntityMetadata,
    OrmMetadataModel
} from '@tyorm/core';

import type {
    QueryPredicate,
    ResolvedSelectQuery
} from '@tyorm/core';

import {
    PostgresSelectCompiler
} from '../src/query/compiler/postgres-select-compiler';

// ============================================================
// FIXTURES
// ============================================================

function createFixture() {

    @Entity({
        name: 'users'
    })
    class User {

        @PrimaryKey({
            type: 'uuid',
            name: 'user_id'
        })
        id!: string;

        @Column({
            type: 'string',
            name: 'first_name'
        })
        firstName!: string;

        @Column({
            type: 'integer',
            name: 'age'
        })
        age!: number;
    }

    const model = new OrmMetadataModel([
        getEntityMetadata(User)
    ]);

    const resolver = new QuerySemanticResolver(model);

    const compiler = new PostgresSelectCompiler();

    return {
        User,
        resolver,
        compiler
    };
}

function createSelect(
    entity: Function,
    selections: Array<{
        expression: ReturnType<typeof column>;
    }>,
    distinct = false
) {
    return {
        kind: 'select' as const,
        from: {
            entity,
            alias: 'u'
        },
        selections,
        joins: [],
        orderBy: [],
        distinct
    };
}

/**
 * Construye una consulta completa antes de resolverla.
 *
 * Es importante que WHERE exista en el AST antes de llamar
 * a QuerySemanticResolver.resolve(), porque el resolvedor
 * registra las columnas utilizadas en los predicados.
 */
function createResolvedFixture(
    where?: QueryPredicate
) {
    const { User, resolver, compiler } =
        createFixture();

    const baseQuery = createSelect(User, [
        {
            expression: column('u', 'id')
        },
        {
            expression: column('u', 'firstName')
        }
    ]);

    const query = {
        ...baseQuery,
        ...(where !== undefined ? { where } : {})
    };

    const resolved = resolver.resolve(query);

    return {
        resolved,
        compiler
    };
}

/**
 * Permite construir deliberadamente un ResolvedSelectQuery
 * inconsistente para probar las defensas del compilador.
 *
 * No debe utilizarse para el flujo normal de resolución.
 */
function withWhere(
    resolved: ResolvedSelectQuery,
    where: QueryPredicate
): ResolvedSelectQuery {
    return {
        ...resolved,
        query: {
            ...resolved.query,
            where
        }
    };
}

// ============================================================
// TESTS
// ============================================================

describe('PostgresSelectCompiler', () => {

    // --------------------------------------------------------
    // METADATA
    // --------------------------------------------------------

    it('initializes Symbol.metadata', () => {
        const symbolConstructor =
            Symbol as SymbolConstructor & {
                metadata?: symbol;
            };

        expect(symbolConstructor.metadata)
            .toBeDefined();

        expect(typeof symbolConstructor.metadata)
            .toBe('symbol');
    });

    // --------------------------------------------------------
    // SELECT
    // --------------------------------------------------------

    it('compiles a single selected column', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = createSelect(User, [
            {
                expression: column('u', 'id')
            }
        ]);

        const resolved = resolver.resolve(query);
        const compiled = compiler.compile(resolved);

        expect(compiled.sql).toBe(
            'SELECT "u"."user_id" FROM "users" AS "u"'
        );

        expect(compiled.parameters).toEqual([]);
    });

    it('compiles multiple selected columns', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = createSelect(User, [
            {
                expression: column('u', 'id')
            },
            {
                expression: column('u', 'firstName')
            }
        ]);

        const compiled = compiler.compile(
            resolver.resolve(query)
        );

        expect(compiled.sql).toBe(
            'SELECT "u"."user_id", "u"."first_name" ' +
            'FROM "users" AS "u"'
        );

        expect(compiled.parameters).toEqual([]);
    });

    it('compiles SELECT DISTINCT', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = createSelect(
            User,
            [
                {
                    expression: column('u', 'firstName')
                }
            ],
            true
        );

        const compiled = compiler.compile(
            resolver.resolve(query)
        );

        expect(compiled.sql).toBe(
            'SELECT DISTINCT "u"."first_name" ' +
            'FROM "users" AS "u"'
        );

        expect(compiled.parameters).toEqual([]);
    });

    it('rejects empty selections', () => {
        const { User, resolver, compiler } =
            createFixture();

        const resolved = resolver.resolve(
            createSelect(User, [])
        );

        expect(() => compiler.compile(resolved))
            .toThrow(/at least one expression/);
    });

    it('returns frozen compiled results', () => {
        const { User, resolver, compiler } =
            createFixture();

        const resolved = resolver.resolve(
            createSelect(User, [
                {
                    expression: column('u', 'id')
                }
            ])
        );

        const compiled = compiler.compile(resolved);

        expect(Object.isFrozen(compiled)).toBe(true);

        expect(Object.isFrozen(compiled.parameters))
            .toBe(true);
    });

    // --------------------------------------------------------
    // WHERE - IS NULL
    // --------------------------------------------------------

    it('compiles SELECT with IS NULL WHERE', () => {
        const { resolved, compiler } =
            createResolvedFixture({
                kind: 'is-null',
                expression: column('u', 'firstName'),
                negated: false
            });

        const result = compiler.compile(resolved);

        expect(result.sql).toBe(
            'SELECT "u"."user_id", "u"."first_name" ' +
            'FROM "users" AS "u" ' +
            'WHERE "u"."first_name" IS NULL'
        );

        expect(result.parameters).toEqual([]);
    });

    // --------------------------------------------------------
    // WHERE - COMPARISON
    // --------------------------------------------------------

    it('compiles SELECT with WHERE comparison', () => {
        const { resolved, compiler } =
            createResolvedFixture({
                kind: 'comparison',
                operator: 'gte',
                left: column('u', 'age'),
                right: {
                    kind: 'parameter',
                    name: 'minimumAge'
                }
            });

        const result = compiler.compile(resolved, {
            minimumAge: 18
        });

        expect(result.sql).toBe(
            'SELECT "u"."user_id", "u"."first_name" ' +
            'FROM "users" AS "u" ' +
            'WHERE "u"."age" >= $1'
        );

        expect(result.parameters).toEqual([18]);
    });

    // --------------------------------------------------------
    // WHERE - LOGICAL + BETWEEN
    // --------------------------------------------------------

    it('compiles SELECT with nested WHERE predicates', () => {
        const { resolved, compiler } =
            createResolvedFixture({
                kind: 'logical',
                operator: 'and',
                predicates: [
                    {
                        kind: 'between',
                        expression: column('u', 'age'),
                        lower: {
                            kind: 'literal',
                            value: 18
                        },
                        upper: {
                            kind: 'literal',
                            value: 65
                        },
                        negated: false
                    },
                    {
                        kind: 'comparison',
                        operator: 'eq',
                        left: column('u', 'firstName'),
                        right: {
                            kind: 'parameter',
                            name: 'name'
                        }
                    }
                ]
            });

        const result = compiler.compile(resolved, {
            name: 'Luis'
        });

        expect(result.sql).toBe(
            'SELECT "u"."user_id", "u"."first_name" ' +
            'FROM "users" AS "u" ' +
            'WHERE (("u"."age" BETWEEN $1 AND $2) ' +
            'AND "u"."first_name" = $3)'
        );

        expect(result.parameters).toEqual([
            18,
            65,
            'Luis'
        ]);
    });

    // --------------------------------------------------------
    // SELECT WITHOUT WHERE
    // --------------------------------------------------------

    it('preserves SELECT without WHERE', () => {
        const { resolved, compiler } =
            createResolvedFixture();

        const result = compiler.compile(resolved);

        expect(result.sql).toBe(
            'SELECT "u"."user_id", "u"."first_name" ' +
            'FROM "users" AS "u"'
        );

        expect(result.parameters).toEqual([]);
    });

    // --------------------------------------------------------
    // MISSING PARAMETERS
    // --------------------------------------------------------

    it('rejects missing WHERE parameters', () => {
        const { resolved, compiler } =
            createResolvedFixture({
                kind: 'comparison',
                operator: 'eq',
                left: column('u', 'age'),
                right: {
                    kind: 'parameter',
                    name: 'age'
                }
            });

        expect(() => compiler.compile(resolved))
            .toThrow(
                'Missing query parameter "age".'
            );
    });

    // --------------------------------------------------------
    // UNSUPPORTED PAGINATION
    // --------------------------------------------------------

    it('rejects LIMIT until implemented', () => {
        const { resolved, compiler } =
            createResolvedFixture();

        const query: ResolvedSelectQuery = {
            ...resolved,
            query: {
                ...resolved.query,
                limit: 10
            }
        };

        expect(() => compiler.compile(query))
            .toThrow(
                'LIMIT and OFFSET are not supported yet.'
            );
    });

    // --------------------------------------------------------
    // UNRESOLVED COLUMN DEFENSE
    // --------------------------------------------------------

    it('rejects unresolved WHERE columns', () => {
        const { resolved, compiler } =
            createResolvedFixture();

        const query = withWhere(resolved, {
            kind: 'comparison',
            operator: 'eq',
            left: column('u', 'unknownProperty'),
            right: {
                kind: 'literal',
                value: 10
            }
        });

        expect(() => compiler.compile(query))
            .toThrow(
                'Unresolved column "u.unknownProperty".'
            );
    });

});
