
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    Column,
    ManyToOne,
    JoinColumn,
    QuerySemanticResolver,
    QuerySemanticError,
    column,
    param,
    eq,
    getEntityMetadata
} from '../src';

import {
    OrmMetadataModel
} from '../src/metadata/orm-metadata-model';

function createFixture() {
    if (Symbol.metadata === undefined) {
    Object.defineProperty(Symbol, 'metadata', {
        value: Symbol('Symbol.metadata'),
        configurable: true
    });
}
    @Entity({ name: 'users' })
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

    @Entity({ name: 'orders' })
    class Order {
        @PrimaryKey({
            type: 'uuid',
            name: 'order_id'
        })
        id!: string;

        @ManyToOne(() => User)
        @JoinColumn({
            name: 'user_id',
            referencedColumnName: 'user_id'
        })
        user!: User;
    }

    const model = new OrmMetadataModel([
        getEntityMetadata(User),
        getEntityMetadata(Order)
    ]);

    return {
        User,
        Order,
        model
    };
}

function createSelect(entity: Function) {
    return {
        kind: 'select' as const,
        from: {
            entity,
            alias: 'u'
        },
        selections: [],
        joins: [],
        orderBy: [],
        distinct: false
    };
}

describe('QuerySemanticResolver', () => {
    it('should resolve a physical column name', () => {
        const { User, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            selections: [
                {
                    expression: column('u', 'firstName')
                }
            ]
        };

        const result = resolver.resolve(query);

        expect(result.columns).toContainEqual({
            kind: 'resolved-column',
            sourceAlias: 'u',
            property: 'firstName',
            columnName: 'first_name',
            tableAlias: 'u'
        });
    });

    it('should resolve primary key columns', () => {
        const { User, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            selections: [
                {
                    expression: column('u', 'id')
                }
            ]
        };

        const result = resolver.resolve(query);

        expect(result.columns[0]?.columnName)
            .toBe('user_id');
    });

    it('should reject unknown entity properties', () => {
        const { User, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            selections: [
                {
                    expression: column('u', 'unknownProperty')
                }
            ]
        };

        expect(() =>
            resolver.resolve(query)
        ).toThrow(QuerySemanticError);
    });

    it('should reject unregistered entities', () => {
        const { model } = createFixture();

        class Unknown { }

        const resolver = new QuerySemanticResolver(model);

        expect(() =>
            resolver.resolve(createSelect(Unknown))
        ).toThrow(/not registered/);
    });

    it('should resolve columns inside WHERE', () => {
        const { User, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            where: eq(
                column('u', 'firstName'),
                param('name')
            )
        };

        const result = resolver.resolve(query);

        expect(result.columns[0]?.columnName)
            .toBe('first_name');
    });

    it('should resolve owning relations in JOIN', () => {
        const { Order, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            kind: 'select' as const,
            from: {
                entity: Order,
                alias: 'o'
            },
            selections: [
                {
                    expression: column('u', 'firstName')
                }
            ],
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'o',
                    relation: 'user',
                    alias: 'u'
                }
            ],
            orderBy: [],
            distinct: false
        };

        const result = resolver.resolve(query);

        expect(result.joins).toHaveLength(1);

        expect(result.joins[0]?.relationProperty)
            .toBe('user');

        expect(result.columns[0]?.columnName)
            .toBe('first_name');
    });

    it('should reject unknown relations', () => {
        const { Order, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            kind: 'select' as const,
            from: {
                entity: Order,
                alias: 'o'
            },
            selections: [],
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'o',
                    relation: 'missingRelation',
                    alias: 'u'
                }
            ],
            orderBy: [],
            distinct: false
        };

        expect(() =>
            resolver.resolve(query)
        ).toThrow(/Unknown relation/);
    });

    it('should return frozen semantic collections', () => {
        const { User, model } = createFixture();

        const resolver = new QuerySemanticResolver(model);

        const result = resolver.resolve(
            createSelect(User)
        );

        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.columns))
            .toBe(true);
        expect(Object.isFrozen(result.joins))
            .toBe(true);
    });
});
