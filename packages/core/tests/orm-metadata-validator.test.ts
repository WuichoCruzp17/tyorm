
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToMany,
    JoinTable,
    getEntityMetadata,
    ensureSymbolMetadata,
    Column,
    ManyToOne
} from '../src/decorators';

import {
    OrmMetadataModel
} from '../src/metadata';

ensureSymbolMetadata();

describe('OrmMetadataValidator', () => {

    it('should reject join table collision with entity table', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'users_roles',
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
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'users_roles' })
        class UserRole {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Role),
            getEntityMetadata(UserRole)
        ])).toThrow(/Duplicate physical table/);
    });

    it('should reject duplicate join table names', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'shared_links',
                joinColumns: [
                    { name: 'user_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'role_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'products' })
        class Product {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'shared_links',
                joinColumns: [
                    { name: 'product_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'role_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Product),
            getEntityMetadata(Role)
        ])).toThrow(/Duplicate physical table/);
    });

    it('should reject duplicate columns across join table sides', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'users_roles',
                joinColumns: [
                    { name: 'entity_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'entity_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ])).toThrow(/Duplicate join table column/);
    });

    it('should allow same join table name in different schemas', () => {
        @Entity({ name: 'users', schema: 'tenant_a' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'links',
                schema: 'tenant_a',
                joinColumns: [
                    { name: 'user_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'role_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'products', schema: 'tenant_b' })
        class Product {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'links',
                schema: 'tenant_b',
                joinColumns: [
                    { name: 'product_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'role_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Product),
            getEntityMetadata(Role)
        ]);

        expect(model.getEntities()).toHaveLength(3);
    });

    it('should accept unique physical tables and join columns', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'users_roles',
                joinColumns: [
                    { name: 'user_id', referencedColumnName: 'id' }
                ],
                inverseJoinColumns: [
                    { name: 'role_id', referencedColumnName: 'id' }
                ]
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        expect(model.getEntity(User).relations).toHaveLength(1);
    });


    it('should accept self-referencing many-to-many relations', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => User)
            @JoinTable({
                name: 'user_connections'
            })
            connections!: User[];
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const joinTable =
            model.getEntity(User).relations[0]?.joinTable;

        expect(joinTable?.joinColumns[0]?.name)
            .toBe('source_users_id');

        expect(joinTable?.inverseJoinColumns[0]?.name)
            .toBe('target_users_id');
    });


    it('should reject duplicate explicit self-referencing columns', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => User)
            @JoinTable({
                name: 'user_connections',
                joinColumns: [
                    {
                        name: 'user_id',
                        referencedColumnName: 'id'
                    }
                ],
                inverseJoinColumns: [
                    {
                        name: 'user_id',
                        referencedColumnName: 'id'
                    }
                ]
            })
            connections!: User[];
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User)
        ])).toThrow(/Duplicate join table column/);
    });



    it('should reject property mapped as both column and relation', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({ type: 'uuid' })
            @ManyToOne(() => User)
            user!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(
            /cannot be mapped as both a column and a relation/
        );
    });


    it('should accept distinct scalar and relation properties', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({ type: 'uuid' })
            referenceId!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const metadata = model.getEntity(Order);

        expect(metadata.entity.columns).toHaveLength(1);
        expect(metadata.relations).toHaveLength(1);
    });


    it('should reject primary key property mapped as relation', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            @ManyToOne(() => User)
            id!: string;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(
            /cannot be mapped as both a column and a relation/
        );
    });


});
