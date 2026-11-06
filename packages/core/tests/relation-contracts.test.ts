
import { describe, expect, it } from 'vitest';

import type {
    RelationMetadata,
    RelationTargetFactory,
    RelationOptions,
    JoinColumnMetadata,
    JoinTableMetadata,
    RelationType,
    ReferentialAction
} from '../src/metadata';

class User {
    id!: string;
    orders!: Order[];
}

class Order {
    id!: string;
    user!: User;
}

class Role {
    id!: string;
}

describe('Relation metadata contracts', () => {
    it('should support all relation types', () => {
        const types: RelationType[] = [
            'one-to-one',
            'one-to-many',
            'many-to-one',
            'many-to-many'
        ];

        expect(types).toHaveLength(4);
    });

    it('should support deferred entity targets', () => {
        const target: RelationTargetFactory<User> = () => User;

        expect(target()).toBe(User);
    });

    it('should describe a many-to-one relation', () => {
        const relation: RelationMetadata<User> = {
            propertyKey: 'user',
            type: 'many-to-one',
            target: () => User,
            inversePropertyKey: 'orders',
            isOwningSide: true,
            nullable: false,
            onDelete: 'RESTRICT',
            joinColumns: [
                {
                    name: 'user_id',
                    referencedColumnName: 'id'
                }
            ]
        };

        expect(relation.target()).toBe(User);
        expect(relation.isOwningSide).toBe(true);
        expect(relation.joinColumns).toHaveLength(1);
    });

    it('should describe an inverse one-to-many relation', () => {
        const relation: RelationMetadata<Order> = {
            propertyKey: 'orders',
            type: 'one-to-many',
            target: () => Order,
            inversePropertyKey: 'user',
            isOwningSide: false,
            nullable: false,
            joinColumns: []
        };

        expect(relation.isOwningSide).toBe(false);
        expect(relation.joinColumns).toHaveLength(0);
    });

    it('should support composite join columns', () => {
        const columns: readonly JoinColumnMetadata[] = [
            {
                name: 'company_id',
                referencedColumnName: 'company_id'
            },
            {
                name: 'user_id',
                referencedColumnName: 'id'
            }
        ];

        expect(columns).toHaveLength(2);
        expect(columns[0]?.name).toBe('company_id');
        expect(columns[1]?.referencedColumnName).toBe('id');
    });

    it('should describe a many-to-many join table', () => {
        const joinTable: JoinTableMetadata = {
            name: 'user_roles',
            schema: 'public',
            joinColumns: [
                {
                    name: 'user_id',
                    referencedColumnName: 'id'
                }
            ],
            inverseJoinColumns: [
                {
                    name: 'role_id',
                    referencedColumnName: 'id'
                }
            ]
        };

        const relation: RelationMetadata<Role> = {
            propertyKey: 'roles',
            type: 'many-to-many',
            target: () => Role,
            isOwningSide: true,
            nullable: false,
            joinColumns: [],
            joinTable
        };

        expect(relation.joinTable?.name).toBe('user_roles');
        expect(relation.joinTable?.joinColumns).toHaveLength(1);
        expect(relation.joinTable?.inverseJoinColumns).toHaveLength(1);
    });

    it('should support referential actions', () => {
        const actions: ReferentialAction[] = [
            'NO ACTION',
            'RESTRICT',
            'CASCADE',
            'SET NULL',
            'SET DEFAULT'
        ];

        expect(actions).toHaveLength(5);
    });

    it('should support relation configuration options', () => {
        const options: RelationOptions = {
            nullable: true,
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        };

        expect(options.nullable).toBe(true);
        expect(options.onDelete).toBe('SET NULL');
        expect(options.onUpdate).toBe('CASCADE');
    });

    it('should allow unidirectional relations', () => {
        const relation: RelationMetadata<User> = {
            propertyKey: 'user',
            type: 'many-to-one',
            target: () => User,
            isOwningSide: true,
            nullable: false,
            joinColumns: []
        };

        expect(relation.inversePropertyKey).toBeUndefined();
    });
});
