
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    executeDtoQuery,
    vectorDistance,
    PrimaryKey,
    Column,
    QuerySemanticResolver,
    column,
    count,
    sum,
    avg,
    min,
    max,
    gt,
    param,
    getEntityMetadata,
    OrmMetadataModel,
    ManyToOne,
    JoinColumn,
    ManyToMany,
    JoinTable
} from '@tyorm/core';

import type {
    EntityTarget,
    QueryJoin,
    QueryPredicate,
    ResolvedSelectQuery
} from '@tyorm/core';

import {
    PostgresSelectCompiler
} from '../src/query/compiler/postgres-select-compiler';

import { createLeftJoinFixture } from './left-join.fixture';

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

    const model = new OrmMetadataModel([getEntityMetadata(User)]);

    const resolver = new QuerySemanticResolver(model);

    const compiler = new PostgresSelectCompiler();

    return {
        User,
        resolver,
        compiler
    };
}


function createSelect(
    entity: EntityTarget,
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


    describe('LIMIT and OFFSET', () => {

        it('compiles SELECT with LIMIT', () => {
            const { resolved, compiler } =
                createResolvedFixture();

            const query: ResolvedSelectQuery = {
                ...resolved,
                query: {
                    ...resolved.query,
                    limit: 10
                }
            };

            const result = compiler.compile(query);

            expect(result.sql).toBe(
                'SELECT "u"."user_id", "u"."first_name" ' +
                'FROM "users" AS "u" LIMIT $1'
            );

            expect(result.parameters).toEqual([10]);
        });

        it('compiles SELECT with OFFSET', () => {
            const { resolved, compiler } =
                createResolvedFixture();

            const query: ResolvedSelectQuery = {
                ...resolved,
                query: {
                    ...resolved.query,
                    offset: 20
                }
            };

            const result = compiler.compile(query);

            expect(result.sql).toBe(
                'SELECT "u"."user_id", "u"."first_name" ' +
                'FROM "users" AS "u" OFFSET $1'
            );

            expect(result.parameters).toEqual([20]);
        });

        it('compiles SELECT with LIMIT and OFFSET', () => {
            const { resolved, compiler } =
                createResolvedFixture();

            const query: ResolvedSelectQuery = {
                ...resolved,
                query: {
                    ...resolved.query,
                    limit: 10,
                    offset: 20
                }
            };

            const result = compiler.compile(query);

            expect(result.sql).toBe(
                'SELECT "u"."user_id", "u"."first_name" ' +
                'FROM "users" AS "u" LIMIT $1 OFFSET $2'
            );

            expect(result.parameters).toEqual([10, 20]);
        });

        it('compiles LIMIT 0 and OFFSET 0', () => {
            const { resolved, compiler } =
                createResolvedFixture();

            const query: ResolvedSelectQuery = {
                ...resolved,
                query: {
                    ...resolved.query,
                    limit: 0,
                    offset: 0
                }
            };

            const result = compiler.compile(query);

            expect(result.sql).toContain(
                'LIMIT $1 OFFSET $2'
            );

            expect(result.parameters).toEqual([0, 0]);
        });

        it('preserves parameter order with WHERE and pagination', () => {
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

            const query: ResolvedSelectQuery = {
                ...resolved,
                query: {
                    ...resolved.query,
                    limit: 10,
                    offset: 20
                }
            };

            const result = compiler.compile(query, {
                minimumAge: 18
            });

            expect(result.sql).toBe(
                'SELECT "u"."user_id", "u"."first_name" ' +
                'FROM "users" AS "u" ' +
                'WHERE "u"."age" >= $1 ' +
                'LIMIT $2 OFFSET $3'
            );

            expect(result.parameters).toEqual([
                18,
                10,
                20
            ]);
        });

        it('returns frozen pagination parameters', () => {
            const { resolved, compiler } =
                createResolvedFixture();

            const query: ResolvedSelectQuery = {
                ...resolved,
                query: {
                    ...resolved.query,
                    limit: 10
                }
            };

            const result = compiler.compile(query);

            expect(Object.isFrozen(result)).toBe(true);
            expect(Object.isFrozen(result.parameters))
                .toBe(true);
        });

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


    it('compiles grouping after WHERE and before ordering and pagination', () => {
        const { User, resolver, compiler } = createFixture();
        const firstName = column('u', 'firstName');
        const age = column('u', 'age');
        const resolved = resolver.resolve({
            ...createSelect(User, [{ expression: firstName }]),
            where: {
                kind: 'comparison',
                operator: 'gte',
                left: age,
                right: { kind: 'parameter', name: 'minimumAge' }
            },
            groupBy: [firstName, age],
            orderBy: [{ expression: firstName, direction: 'asc' }],
            limit: 5
        });

        expect(compiler.compile(resolved, { minimumAge: 18 })).toEqual({
            sql: 'SELECT "u"."first_name" FROM "users" AS "u" ' +
                'WHERE "u"."age" >= $1 GROUP BY "u"."first_name", "u"."age" ' +
                'ORDER BY "u"."first_name" ASC LIMIT $2',
            parameters: [18, 5]
        });
    });

    it('passes through null DTO values and rejects missing result aliases', async () => {
        const { User, resolver, compiler } = createFixture();
        const query = createSelect(User, []);
        const projection = {
            select: { givenName: column('u', 'firstName') },
            map: ({ givenName }: { readonly givenName: unknown }) => ({ givenName })
        };

        const result = await executeDtoQuery({
            async execute<T>() {
                return { rows: [{ givenName: null, extra: 1 } as T], affectedRows: 1 };
            }
        }, resolver, compiler, query, projection);
        expect(result).toEqual([{ givenName: null }]);

        await expect(executeDtoQuery({
            async execute<T>() {
                return { rows: [{ first_name: 'Ada' } as T], affectedRows: 1 };
            }
        }, resolver, compiler, query, projection)).rejects.toThrow(
            'Missing DTO projection alias "givenName" in query result.'
        );
    });

    it('compiles aggregate projections, predicates and ordering', () => {
        const { User, resolver, compiler } = createFixture();
        const age = column('u', 'age');
        const resolved = resolver.resolve({
            ...createSelect(User, []),
            selections: [
                { expression: count(), alias: 'total' },
                { expression: count(age) },
                { expression: sum(age) },
                { expression: avg(age) },
                { expression: min(age) },
                { expression: max(age) }
            ],
            having: gt(count(), param('minimum')),
            orderBy: [{ expression: max(age), direction: 'desc' }]
        });

        expect(compiler.compile(resolved, { minimum: 2 })).toEqual({
            sql: 'SELECT COUNT(*) AS "total", COUNT("u"."age"), SUM("u"."age"), ' +
                'AVG("u"."age"), MIN("u"."age"), MAX("u"."age") FROM "users" AS "u" ' +
                'HAVING COUNT(*) > $1 ORDER BY MAX("u"."age") DESC',
            parameters: [2]
        });
    });

    it('compiles HAVING after GROUP BY and binds its parameters before pagination', () => {
        const { User, resolver, compiler } = createFixture();
        const firstName = column('u', 'firstName');
        const age = column('u', 'age');
        const resolved = resolver.resolve({
            ...createSelect(User, [{ expression: firstName }]),
            where: {
                kind: 'comparison',
                operator: 'gte',
                left: age,
                right: { kind: 'parameter', name: 'minimumAge' }
            },
            groupBy: [firstName, age],
            having: {
                kind: 'comparison',
                operator: 'lte',
                left: age,
                right: { kind: 'parameter', name: 'maximumAge' }
            },
            orderBy: [{ expression: firstName, direction: 'asc' }],
            limit: 5
        });

        expect(compiler.compile(resolved, { minimumAge: 18, maximumAge: 65 })).toEqual({
            sql: 'SELECT "u"."first_name" FROM "users" AS "u" ' +
                'WHERE "u"."age" >= $1 GROUP BY "u"."first_name", "u"."age" ' +
                'HAVING "u"."age" <= $2 ORDER BY "u"."first_name" ASC LIMIT $3',
            parameters: [18, 65, 5]
        });
    });

    it('resolves properties used only in HAVING', () => {
        const { User, resolver } = createFixture();
        const id = column('u', 'id');

        expect(() => resolver.resolve({
            ...createSelect(User, [{ expression: id }]),
            groupBy: [id],
            having: {
                kind: 'is-null',
                expression: column('u', 'missing'),
                negated: false
            }
        })).toThrow('Unknown property "missing"');
    });

    it('omits the clause for empty grouping', () => {
        const { User, resolver, compiler } = createFixture();
        const resolved = resolver.resolve({
            ...createSelect(User, [{ expression: column('u', 'id') }]),
            groupBy: []
        });

        expect(compiler.compile(resolved).sql)
            .toBe('SELECT "u"."user_id" FROM "users" AS "u"');
    });

    it('resolves properties used only for grouping', () => {
        const { User, resolver } = createFixture();
        expect(() => resolver.resolve({
            ...createSelect(User, [{ expression: column('u', 'id') }]),
            groupBy: [column('u', 'unknown')]
        })).toThrow('Unknown property "unknown"');
    });

    it('compiles ORDER BY ASC', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = {
            ...createSelect(User, [
                {
                    expression: column('u', 'id')
                }
            ]),
            orderBy: [
                {
                    expression: column('u', 'firstName'),
                    direction: 'asc' as const
                }
            ]
        };

        const compiled = compiler.compile(
            resolver.resolve(query)
        );

        expect(compiled.sql).toBe(
            'SELECT "u"."user_id" ' +
            'FROM "users" AS "u" ' +
            'ORDER BY "u"."first_name" ASC'
        );

        expect(compiled.parameters).toEqual([]);
    });


    it('compiles multiple ORDER BY expressions', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = {
            ...createSelect(User, [
                {
                    expression: column('u', 'id')
                }
            ]),
            orderBy: [
                {
                    expression: column('u', 'firstName'),
                    direction: 'asc' as const
                },
                {
                    expression: column('u', 'age'),
                    direction: 'desc' as const
                }
            ]
        };

        const compiled = compiler.compile(
            resolver.resolve(query)
        );

        expect(compiled.sql).toBe(
            'SELECT "u"."user_id" ' +
            'FROM "users" AS "u" ' +
            'ORDER BY "u"."first_name" ASC, "u"."age" DESC'
        );
    });


    it('compiles WHERE followed by ORDER BY', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = {
            ...createSelect(User, [
                {
                    expression: column('u', 'id')
                }
            ]),
            where: {
                kind: 'comparison' as const,
                operator: 'gte' as const,
                left: column('u', 'age'),
                right: {
                    kind: 'parameter' as const,
                    name: 'minimumAge'
                }
            },
            orderBy: [
                {
                    expression: column('u', 'firstName'),
                    direction: 'asc' as const
                }
            ]
        };

        const compiled = compiler.compile(
            resolver.resolve(query),
            {
                minimumAge: 18
            }
        );

        expect(compiled.sql).toBe(
            'SELECT "u"."user_id" ' +
            'FROM "users" AS "u" ' +
            'WHERE "u"."age" >= $1 ' +
            'ORDER BY "u"."first_name" ASC'
        );

        expect(compiled.parameters).toEqual([18]);
    });


    it('rejects unknown ORDER BY properties', () => {
        const { User, resolver } =
            createFixture();

        const query = {
            ...createSelect(User, [
                {
                    expression: column('u', 'id')
                }
            ]),
            orderBy: [
                {
                    expression: column('u', 'unknownProperty'),
                    direction: 'asc' as const
                }
            ]
        };

        expect(() => resolver.resolve(query))
            .toThrow(/Unknown property "unknownProperty"/);
    });


    describe('Direct JOIN compilation', () => {

        function createJoinFixture() {
            @Entity({ name: 'departments' })
            class Department {
                @PrimaryKey({ type: 'uuid', name: 'department_id' })
                id!: string;
            }

            @Entity({ name: 'users' })
            class User {
                @PrimaryKey({ type: 'uuid', name: 'user_id' })
                id!: string;

                @ManyToOne(() => Department)
                @JoinColumn({
                    name: 'department_id',
                    referencedColumnName: 'department_id'
                })
                department!: Department;
            }

            const model = new OrmMetadataModel([
                getEntityMetadata(User),
                getEntityMetadata(Department)
            ]);
            const joins: QueryJoin[] = [
                {
                    kind: 'join',
                    type: 'inner',
                    sourceAlias: 'u',
                    relation: 'department',
                    alias: 'd'
                }
            ];

            return {
                model,
                User,
                resolver: new QuerySemanticResolver(model),
                compiler: new PostgresSelectCompiler(),
                query: {
                    ...createSelect(User, [{ expression: column('u', 'id') }]),
                    joins
                }
            };
        }

        it('compiles INNER JOIN with resolved conditions', () => {
            const { model, User, resolver, compiler, query } = createJoinFixture();

            expect(model.getEntity(User).relations).toMatchObject([
                {
                    propertyKey: 'department',
                    isOwningSide: true,
                    joinColumns: [
                        { name: 'department_id', referencedColumnName: 'department_id' }
                    ]
                }
            ]);

            const resolved = resolver.resolve(query);
            expect(resolved.joins[0]?.plan).toEqual({
                kind: 'direct',
                conditions: [
                    {
                        kind: 'resolved-join-condition',
                        left: { tableAlias: 'u', columnName: 'department_id' },
                        right: { tableAlias: 'd', columnName: 'department_id' }
                    }
                ]
            });

            expect(compiler.compile(resolved)).toEqual({
                sql: 'SELECT "u"."user_id" FROM "users" AS "u" ' +
                    'INNER JOIN "departments" AS "d" ' +
                    'ON "u"."department_id" = "d"."department_id"',
                parameters: []
            });
        });


        it('quotes the target schema and combines composite key conditions', () => {
            @Entity({ name: 'departments', schema: 'organization' })
            class Department {
                @PrimaryKey({ type: 'uuid', name: 'department_id' })
                id!: string;

                @PrimaryKey({ type: 'integer', name: 'region_id' })
                region!: number;
            }

            @Entity({ name: 'users' })
            class User {
                @PrimaryKey({ type: 'uuid', name: 'user_id' })
                id!: string;

                @ManyToOne(() => Department)
                @JoinColumn([
                    { name: 'department_fk', referencedColumnName: 'department_id' },
                    { name: 'region_fk', referencedColumnName: 'region_id' }
                ])
                department!: Department;
            }

            const resolver = new QuerySemanticResolver(new OrmMetadataModel([
                getEntityMetadata(User),
                getEntityMetadata(Department)
            ]));
            const resolved = resolver.resolve({
                ...createSelect(User, [{ expression: column('u', 'id') }]),
                joins: [
                    {
                        kind: 'join',
                        type: 'inner',
                        sourceAlias: 'u',
                        relation: 'department',
                        alias: 'd'
                    }
                ]
            });

            expect(new PostgresSelectCompiler().compile(resolved)).toEqual({
                sql: 'SELECT "u"."user_id" FROM "users" AS "u" ' +
                    'INNER JOIN "organization"."departments" AS "d" ' +
                    'ON "u"."department_fk" = "d"."department_id" ' +
                    'AND "u"."region_fk" = "d"."region_id"',
                parameters: []
            });
        });

        it('binds ON parameters before WHERE and pagination', () => {
            const { resolver, compiler, query } = createJoinFixture();
            const resolved = resolver.resolve({
                ...query,
                selections: [{ expression: column('d', 'id') }],
                joins: query.joins.map(join => ({
                    ...join,
                    on: {
                        kind: 'logical',
                        operator: 'or',
                        predicates: [
                            {
                                kind: 'comparison',
                                operator: 'eq',
                                left: column('d', 'id'),
                                right: { kind: 'parameter', name: 'department' }
                            },
                            {
                                kind: 'comparison',
                                operator: 'eq',
                                left: column('d', 'id'),
                                right: { kind: 'parameter', name: 'fallback' }
                            }
                        ]
                    }
                })),
                where: {
                    kind: 'comparison',
                    operator: 'eq',
                    left: column('u', 'id'),
                    right: { kind: 'parameter', name: 'user' }
                },
                orderBy: [{ expression: column('d', 'id'), direction: 'asc' }],
                limit: 10,
                offset: 20
            });

            expect(compiler.compile(resolved, {
                department: 'department-1',
                fallback: 'department-2',
                user: 'user-1'
            })).toEqual({
                sql: 'SELECT "d"."department_id" FROM "users" AS "u" ' +
                    'INNER JOIN "departments" AS "d" ' +
                    'ON "u"."department_id" = "d"."department_id" ' +
                    'AND (("d"."department_id" = $1 OR "d"."department_id" = $2)) ' +
                    'WHERE "u"."user_id" = $3 ORDER BY "d"."department_id" ASC ' +
                    'LIMIT $4 OFFSET $5',
                parameters: ['department-1', 'department-2', 'user-1', 10, 20]
            });
        });

    });


    describe('ManyToMany JOIN compilation', () => {
        @Entity({ name: 'roles', schema: 'auth' })
        class Role {
            @PrimaryKey({ type: 'uuid', name: 'role_id' })
            id!: string;

            @ManyToMany(() => User, 'roles')
            users!: User[];
        }

        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid', name: 'user_id' })
            id!: string;

            @PrimaryKey({ type: 'integer', name: 'tenant_id' })
            tenantId!: number;

            @ManyToMany(() => Role, 'users')
            @JoinTable({
                name: 'user roles',
                schema: 'access',
                joinColumns: [
                    { name: 'member_fk', referencedColumnName: 'user_id' },
                    { name: 'tenant_fk', referencedColumnName: 'tenant_id' }
                ],
                inverseJoinColumns: [
                    { name: 'permission_fk', referencedColumnName: 'role_id' }
                ]
            })
            roles!: Role[];
        }

        const resolver = new QuerySemanticResolver(new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]));
        const compiler = new PostgresSelectCompiler();

        it('compiles an owning INNER JOIN using both sets of junction columns', () => {
            const resolved = resolver.resolve({
                ...createSelect(User, [{ expression: column('u', 'id') }]),
                joins: [{
                    kind: 'join',
                    type: 'inner',
                    sourceAlias: 'u',
                    relation: 'roles',
                    alias: '__tyorm_junction_0'
                }]
            });

            expect(compiler.compile(resolved)).toEqual({
                sql: 'SELECT "u"."user_id" FROM "users" AS "u" ' +
                    'INNER JOIN "access"."user roles" AS "__tyorm_junction_1" ' +
                    'ON "u"."user_id" = "__tyorm_junction_1"."member_fk" ' +
                    'AND "u"."tenant_id" = "__tyorm_junction_1"."tenant_fk" ' +
                    'INNER JOIN "auth"."roles" AS "__tyorm_junction_0" ' +
                    'ON "__tyorm_junction_1"."permission_fk" = "__tyorm_junction_0"."role_id"',
                parameters: []
            });
        });

        it('compiles an inverse LEFT JOIN and binds the target filter before WHERE', () => {
            const resolved = resolver.resolve({
                ...createSelect(Role, [{ expression: column('member', 'id') }]),
                joins: [{
                    kind: 'join',
                    type: 'left',
                    sourceAlias: 'u',
                    relation: 'users',
                    alias: 'member',
                    on: {
                        kind: 'comparison',
                        operator: 'eq',
                        left: column('member', 'tenantId'),
                        right: { kind: 'parameter', name: 'tenant' }
                    }
                }],
                where: {
                    kind: 'comparison',
                    operator: 'eq',
                    left: column('u', 'id'),
                    right: { kind: 'parameter', name: 'role' }
                }
            });

            expect(compiler.compile(resolved, { tenant: 7, role: 'role-1' })).toEqual({
                sql: 'SELECT "member"."user_id" FROM "auth"."roles" AS "u" ' +
                    'LEFT JOIN "access"."user roles" AS "__tyorm_junction_0" ' +
                    'ON "u"."role_id" = "__tyorm_junction_0"."permission_fk" ' +
                    'LEFT JOIN "users" AS "member" ' +
                    'ON "__tyorm_junction_0"."member_fk" = "member"."user_id" ' +
                    'AND "__tyorm_junction_0"."tenant_fk" = "member"."tenant_id" ' +
                    'AND ("member"."tenant_id" = $1) WHERE "u"."role_id" = $2',
                parameters: [7, 'role-1']
            });
        });
    });


    describe('LEFT JOIN compilation', () => {
        it('uses the owning foreign key on the target of an inverse join', () => {
            const { resolver, inverseQuery } = createLeftJoinFixture();
            const resolved = resolver.resolve(inverseQuery);

            expect(resolved.joins[0]?.plan).toEqual({
                kind: 'direct',
                conditions: [{
                    kind: 'resolved-join-condition',
                    left: { tableAlias: 'd', columnName: 'department_id' },
                    right: { tableAlias: 'u', columnName: 'department_fk' }
                }]
            });

            expect(new PostgresSelectCompiler().compile(resolved, { status: 'active' }))
                .toEqual({
                    sql: 'SELECT "d"."department_id", "u"."user_id" ' +
                        'FROM "pg_temp"."left_join_departments" AS "d" ' +
                        'LEFT JOIN "pg_temp"."left_join_users" AS "u" ' +
                        'ON "d"."department_id" = "u"."department_fk" ' +
                        'AND ("u"."status" = $1) ORDER BY "d"."department_id" ASC',
                    parameters: ['active']
                });
        });

        it('uses the nullable foreign key on the source of an owning join', () => {
            const { resolver, owningQuery } = createLeftJoinFixture();
            const resolved = resolver.resolve(owningQuery);

            expect(resolved.aliases.get('u')?.metadata.relations).toMatchObject([
                { propertyKey: 'department', isOwningSide: true, nullable: true }
            ]);

            expect(new PostgresSelectCompiler().compile(resolved)).toEqual({
                sql: 'SELECT "u"."user_id", "d"."department_id" ' +
                    'FROM "pg_temp"."left_join_users" AS "u" ' +
                    'LEFT JOIN "pg_temp"."left_join_departments" AS "d" ' +
                    'ON "u"."department_fk" = "d"."department_id" ' +
                    'ORDER BY "u"."user_id" ASC',
                parameters: []
            });
        });
    });

});

describe('PostgreSQL mutation compilation', () => {
    const compiler = new PostgresSelectCompiler();
    const target = {
        schema: 'app',
        table: 'doc"uments',
        returning: [{ column: 'doc_id', alias: 'id' }]
    };

    it('uses DEFAULT VALUES when every insert column is generated or omitted', () => {
        expect(compiler.compileMutation({ ...target, kind: 'insert', values: [] })).toEqual({
            sql: 'INSERT INTO "app"."doc""uments" DEFAULT VALUES RETURNING "doc_id" AS "id"',
            parameters: []
        });
    });

    it('binds update values before all components of the key', () => {
        expect(compiler.compileMutation({
            ...target, kind: 'update',
            values: [{ column: 'title', value: "O'Brien" }],
            key: [{ column: 'doc_id', value: 3 }, { column: 'tenant_id', value: 8 }]
        })).toEqual({
            sql: 'UPDATE "app"."doc""uments" SET "title" = $1 WHERE "doc_id" = $2 AND "tenant_id" = $3 RETURNING "doc_id" AS "id"',
            parameters: ["O'Brien", 3, 8]
        });
        expect(() => compiler.compileMutation({ ...target, kind: 'delete', key: [] }))
            .toThrow('DELETE requires a primary key.');
    });
});

describe('PostgreSQL vector distance', () => {
    @Entity({ name: 'documents' })
    class Document {
        @PrimaryKey({ type: 'integer' })
        id!: number;

        @Column({ type: 'vector', name: 'embedding_data' })
        embedding!: number[];
    }

    const resolver = new QuerySemanticResolver(new OrmMetadataModel([getEntityMetadata(Document)]));
    const compiler = new PostgresSelectCompiler();

    it.each([['l2', '<->'], ['cosine', '<=>']] as const)('compiles %s with bound vector values', (metric, operator) => {
        const input = [1, 2];
        const distance = vectorDistance(column('d', 'embedding'), input, metric);
        input[0] = 9;
        const compiled = compiler.compile(resolver.resolve({
            kind: 'select',
            from: { entity: Document, alias: 'd' },
            selections: [{ expression: distance, alias: 'distance' }],
            joins: [], distinct: false,
            orderBy: [{ expression: distance, direction: 'asc' }],
            limit: 3
        }));
        expect(compiled).toEqual({
            sql: `SELECT ("d"."embedding_data" ${operator} $1::vector) AS "distance" FROM "documents" AS "d" ORDER BY ("d"."embedding_data" ${operator} $2::vector) ASC LIMIT $3`,
            parameters: ['[1,2]', '[1,2]', 3]
        });
    });

    it('rejects invalid components and non-vector columns before compilation', () => {
        const resolve = (distance: ReturnType<typeof vectorDistance>) => resolver.resolve({
            kind: 'select',
            from: { entity: Document, alias: 'd' },
            selections: [{ expression: distance }],
            joins: [], distinct: false, orderBy: []
        });
        expect(() => resolve(vectorDistance(column('d', 'embedding'), [Infinity]))).toThrow('finite');
        expect(() => resolve(vectorDistance(column('d', 'embedding'), [0], 'cosine'))).toThrow('nonzero');
        expect(() => resolve(vectorDistance(column('d', 'id'), [1]))).toThrow('must have type vector');
    });
});
