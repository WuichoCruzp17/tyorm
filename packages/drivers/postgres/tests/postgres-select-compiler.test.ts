
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

import {initializeSymbolMetadata} from "../../postgres/src/runtime";

import {
    PostgresSelectCompiler
} from '../src/query/compiler/postgres-select-compiler';

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

describe('PostgresSelectCompiler', () => {

    it('initializes Symbol.metadata', () => {
    const symbolConstructor = Symbol as SymbolConstructor & {
        metadata?: symbol;
    };

    expect(symbolConstructor.metadata).toBeDefined();
    expect(typeof symbolConstructor.metadata).toBe('symbol');
});
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

    it('rejects unsupported WHERE clauses', () => {
        const { User, resolver, compiler } =
            createFixture();

        const query = {
            ...createSelect(User, [
                {
                    expression: column('u', 'id')
                }
            ]),
            where: {
                kind: 'is-null' as const,
                expression: column('u', 'firstName'),
                negated: false
            }
        };

        const resolved = resolver.resolve(query);

        expect(() => compiler.compile(resolved))
            .toThrow(/not supported/);
    });

});
