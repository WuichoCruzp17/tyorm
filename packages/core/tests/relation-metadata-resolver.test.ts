
import { describe, expect, it } from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    OneToMany,
    ManyToMany,
    JoinColumn,
    JoinTable,
    getEntityMetadata,
    ensureSymbolMetadata
} from '../src/decorators';

import {
    MetadataError,
    RelationMetadataResolver
} from '../src/metadata';

ensureSymbolMetadata();
describe('RelationMetadataResolver', () => {
    it('should resolve a many-to-one relation', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToMany(() => Order, 'user')
            orders!: Order[];
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User, 'orders', {
                nullable: false,
                onDelete: 'CASCADE'
            })
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const result = resolver.resolve(Order);
        const relation = result.relations[0];

        expect(relation?.type).toBe('many-to-one');
        expect(relation?.isOwningSide).toBe(true);
        expect(relation?.inversePropertyKey).toBe('orders');
        expect(relation?.onDelete).toBe('CASCADE');

        expect(relation?.joinColumns).toEqual([
            {
                name: 'user_id',
                referencedColumnName: 'id'
            }
        ]);
    });

    it('should resolve inverse one-to-many relations', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToMany(() => Order, 'user')
            orders!: Order[];
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User, 'orders')
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.isOwningSide).toBe(false);
        expect(relation?.joinColumns).toHaveLength(0);
    });

    it('should resolve a many-to-many join table', () => {
        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => User, 'roles')
            users!: User[];
        }

        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role, 'users')
            @JoinTable({
                name: 'user_roles',
                joinColumns: [
                    { name: 'user_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'role_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.isOwningSide).toBe(true);
        expect(relation?.joinTable?.name).toBe('user_roles');
        expect(relation?.joinTable?.joinColumns).toHaveLength(1);
        expect(relation?.joinTable?.inverseJoinColumns).toHaveLength(1);
    });

    it('should reject missing destination entities', () => {
        class User { }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(Order)
        ]);

        expect(() => resolver.resolve(Order))
            .toThrow(MetadataError);
    });

    it('should reject missing inverse relations', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User, 'orders' as keyof User)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(() => resolver.resolve(Order))
            .toThrow(/does not exist/);
    });

    it('should reject incomplete composite joins', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            companyId!: string;

            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(() => resolver.resolve(Order))
            .toThrow(/complete primary key/);
    });

    it('should reject join tables on many-to-one', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinTable({ name: 'invalid_table' })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(() => resolver.resolve(Order))
            .toThrow(/requires ManyToMany/);
    });

    it('should reject function inverse selectors', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User, user => user.id)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(() => resolver.resolve(Order))
            .toThrow(/Function inverse selectors/);
    });
});
