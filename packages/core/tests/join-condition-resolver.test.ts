import {
    describe,
    expect,
    it
} from 'vitest';

import {
    JoinConditionResolver
} from '../src/query/semantic/join-condition-resolver';

import type {
    RelationMetadata
} from '../src/metadata/contracts';

import type {
    OrmEntityMetadata
} from '../src/metadata/orm-entity-metadata';

import type {
    EntityMetadata
} from '../src/metadata/contracts';

class User { }
class Order { }

describe('JoinConditionResolver', () => {

    const resolver = new JoinConditionResolver();

    const createRelation = (
        joinColumns: RelationMetadata['joinColumns']
    ): RelationMetadata => ({
        propertyKey: 'user',
        type: 'many-to-one',
        target: () => User,
        isOwningSide: true,
        nullable: false,
        joinColumns
    });

    const createEntityMetadata = (
        target: new (...args: any[]) => object,
        relations: readonly RelationMetadata[]
    ): OrmEntityMetadata => ({
        entity: {
            target,
            tableName: target.name.toLowerCase(),
            columns: [],
            primaryKeys: []
        } as EntityMetadata,
        relations
    });

    it('should resolve owning join columns', () => {
        const relation = createRelation([
            {
                name: 'user_id',
                referencedColumnName: 'id'
            }
        ]);

        const conditions = resolver.resolve(
            relation,
            'o',
            'u'
        );

        expect(conditions).toEqual([
            {
                kind: 'resolved-join-condition',
                left: {
                    tableAlias: 'o',
                    columnName: 'user_id'
                },
                right: {
                    tableAlias: 'u',
                    columnName: 'id'
                }
            }
        ]);
    });

    it('should support composite keys', () => {
        const relation = createRelation([
            {
                name: 'tenant_id',
                referencedColumnName: 'tenant_id'
            },
            {
                name: 'user_id',
                referencedColumnName: 'id'
            }
        ]);

        const conditions = resolver.resolve(
            relation,
            'o',
            'u'
        );

        expect(conditions).toHaveLength(2);

        expect(conditions[0]?.left.columnName)
            .toBe('tenant_id');

        expect(conditions[0]?.right.columnName)
            .toBe('tenant_id');

        expect(conditions[1]?.left.columnName)
            .toBe('user_id');

        expect(conditions[1]?.right.columnName)
            .toBe('id');
    });

    it('should require metadata for inverse relations', () => {
    const relation: RelationMetadata = {
        propertyKey: 'orders',
        type: 'one-to-many',
        target: () => Order,
        inversePropertyKey: 'user',
        isOwningSide: false,
        nullable: true,
        joinColumns: []
    };

    expect(() =>
        resolver.resolve(relation, 'u', 'o')
    ).toThrow(
        /requires source and target metadata/
    );
});

    it('should resolve inverse OneToMany relation', () => {
        const owningRelation: RelationMetadata = {
            propertyKey: 'user',
            type: 'many-to-one',
            target: () => User,
            inversePropertyKey: 'orders',
            isOwningSide: true,
            nullable: false,
            joinColumns: [
                {
                    name: 'user_id',
                    referencedColumnName: 'id'
                }
            ]
        };

        const inverseRelation: RelationMetadata = {
            propertyKey: 'orders',
            type: 'one-to-many',
            target: () => Order,
            inversePropertyKey: 'user',
            isOwningSide: false,
            nullable: true,
            joinColumns: []
        };

        const sourceMetadata = createEntityMetadata(
            User,
            [inverseRelation]
        );

        const targetMetadata = createEntityMetadata(
            Order,
            [owningRelation]
        );

        const conditions = resolver.resolve(
            inverseRelation,
            'u',
            'o',
            sourceMetadata,
            targetMetadata
        );

        expect(conditions).toEqual([
            {
                kind: 'resolved-join-condition',
                left: {
                    tableAlias: 'u',
                    columnName: 'id'
                },
                right: {
                    tableAlias: 'o',
                    columnName: 'user_id'
                }
            }
        ]);
    });

    it('should reject inverse relation without owning relation', () => {
        const inverseRelation: RelationMetadata = {
            propertyKey: 'orders',
            type: 'one-to-many',
            target: () => Order,
            inversePropertyKey: 'user',
            isOwningSide: false,
            nullable: true,
            joinColumns: []
        };

        const sourceMetadata = createEntityMetadata(
            User,
            [inverseRelation]
        );

        const targetMetadata = createEntityMetadata(
            Order,
            []
        );

        expect(() =>
            resolver.resolve(
                inverseRelation,
                'u',
                'o',
                sourceMetadata,
                targetMetadata
            )
        ).toThrow(/was not found/);
    });

    it('should resolve inverse relation with composite keys', () => {
        const owningRelation: RelationMetadata = {
            propertyKey: 'user',
            type: 'many-to-one',
            target: () => User,
            inversePropertyKey: 'orders',
            isOwningSide: true,
            nullable: false,
            joinColumns: [
                {
                    name: 'tenant_id',
                    referencedColumnName: 'tenant_id'
                },
                {
                    name: 'user_id',
                    referencedColumnName: 'id'
                }
            ]
        };

        const inverseRelation: RelationMetadata = {
            propertyKey: 'orders',
            type: 'one-to-many',
            target: () => Order,
            inversePropertyKey: 'user',
            isOwningSide: false,
            nullable: true,
            joinColumns: []
        };

        const conditions = resolver.resolve(
            inverseRelation,
            'u',
            'o',
            createEntityMetadata(User, [inverseRelation]),
            createEntityMetadata(Order, [owningRelation])
        );

        expect(conditions).toHaveLength(2);

        expect(conditions[0]?.left.columnName)
            .toBe('tenant_id');

        expect(conditions[0]?.right.columnName)
            .toBe('tenant_id');

        expect(conditions[1]?.left.columnName)
            .toBe('id');

        expect(conditions[1]?.right.columnName)
            .toBe('user_id');
    });
});
