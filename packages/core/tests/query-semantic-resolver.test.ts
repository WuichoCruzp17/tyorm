
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
    ManyToMany,
    JoinTable
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

    function createManyToManyFixture() {

        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            id!: string;

            @ManyToMany(() => Role, 'users')
            @JoinTable({
                name: 'user_roles',
                joinColumns: [
                    {
                        name: 'user_id',
                        referencedColumnName: 'user_id'
                    }
                ],
                inverseJoinColumns: [
                    {
                        name: 'role_id',
                        referencedColumnName: 'role_id'
                    }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({
                type: 'uuid',
                name: 'role_id'
            })
            id!: string;

            @ManyToMany(() => User, 'roles')
            users!: User[];
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        return {
            User,
            Role,
            model
        };
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

function createManyToManyFixture() {

    @Entity({ name: 'users' })
    class User {
        @PrimaryKey({
            type: 'uuid',
            name: 'user_id'
        })
        id!: string;

        @ManyToMany(() => Role, 'users')
        @JoinTable({
            name: 'user_roles',
            joinColumns: [
                {
                    name: 'user_id',
                    referencedColumnName: 'user_id'
                }
            ],
            inverseJoinColumns: [
                {
                    name: 'role_id',
                    referencedColumnName: 'role_id'
                }
            ]
        })
        roles!: Role[];
    }

    @Entity({ name: 'roles' })
    class Role {
        @PrimaryKey({
            type: 'uuid',
            name: 'role_id'
        })
        id!: string;

        @ManyToMany(() => User, 'roles')
        users!: User[];
    }

    const model = new OrmMetadataModel([
        getEntityMetadata(User),
        getEntityMetadata(Role)
    ]);

    return {
        User,
        Role,
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



describe('QuerySemanticResolver - ManyToMany', () => {

    it('should resolve owning ManyToMany JOIN', () => {
        const { User, model } =
            createManyToManyFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'u',
                    relation: 'roles',
                    alias: 'r'
                }
            ]
        };

        const result = resolver.resolve(query);

        expect(result.joins).toHaveLength(1);

        const plan = result.joins[0]?.plan;

        expect(plan?.kind).toBe('junction');

        if (plan?.kind !== 'junction') {
            throw new Error('Expected junction plan');
        }

        expect(plan.table.name).toBe('user_roles');

        expect(plan.sourceConditions).toEqual([
            {
                kind: 'resolved-join-condition',
                left: {
                    tableAlias: 'u',
                    columnName: 'user_id'
                },
                right: {
                    tableAlias: plan.table.alias,
                    columnName: 'user_id'
                }
            }
        ]);

        expect(plan.targetConditions).toEqual([
            {
                kind: 'resolved-join-condition',
                left: {
                    tableAlias: plan.table.alias,
                    columnName: 'role_id'
                },
                right: {
                    tableAlias: 'r',
                    columnName: 'role_id'
                }
            }
        ]);
    });

    it('should resolve inverse ManyToMany JOIN', () => {
        const { Role, model } =
            createManyToManyFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            kind: 'select' as const,
            from: {
                entity: Role,
                alias: 'r'
            },
            selections: [],
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'r',
                    relation: 'users',
                    alias: 'u'
                }
            ],
            orderBy: [],
            distinct: false
        };

        const result = resolver.resolve(query);

        const plan = result.joins[0]?.plan;

        expect(plan?.kind).toBe('junction');

        if (plan?.kind !== 'junction') {
            throw new Error('Expected junction plan');
        }

        expect(plan.sourceConditions[0]?.right.columnName)
            .toBe('role_id');

        expect(plan.targetConditions[0]?.left.columnName)
            .toBe('user_id');
    });

    it('should avoid reserved junction aliases', () => {
        const { User, model } =
            createManyToManyFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'u',
                    relation: 'roles',
                    alias: '__tyorm_junction_0'
                }
            ]
        };

        const result = resolver.resolve(query);

        const plan = result.joins[0]?.plan;

        expect(plan?.kind).toBe('junction');

        if (plan?.kind !== 'junction') {
            throw new Error('Expected junction plan');
        }

        expect(plan.table.alias)
            .not.toBe('__tyorm_junction_0');

        expect(plan.table.alias)
            .toBe('__tyorm_junction_1');
    });

    it('should resolve chained ManyToMany JOINs', () => {
        const { User, model } =
            createManyToManyFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'u',
                    relation: 'roles',
                    alias: 'r'
                },
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'r',
                    relation: 'users',
                    alias: 'u2'
                }
            ]
        };

        const result = resolver.resolve(query);

        expect(result.joins).toHaveLength(2);

        const first = result.joins[0]?.plan;
        const second = result.joins[1]?.plan;

        expect(first?.kind).toBe('junction');
        expect(second?.kind).toBe('junction');

        if (
            first?.kind !== 'junction' ||
            second?.kind !== 'junction'
        ) {
            throw new Error('Expected junction plans');
        }

        expect(first.table.alias)
            .not.toBe(second.table.alias);

        expect(result.aliases.has('u')).toBe(true);
        expect(result.aliases.has('r')).toBe(true);
        expect(result.aliases.has('u2')).toBe(true);
    });

    it('should reject duplicate entity aliases', () => {
        const { User, model } =
            createManyToManyFixture();

        const resolver = new QuerySemanticResolver(model);

        const query = {
            ...createSelect(User),
            joins: [
                {
                    kind: 'join' as const,
                    type: 'inner' as const,
                    sourceAlias: 'u',
                    relation: 'roles',
                    alias: 'u'
                }
            ]
        };

        expect(() =>
            resolver.resolve(query)
        ).toThrow();
    });

});
