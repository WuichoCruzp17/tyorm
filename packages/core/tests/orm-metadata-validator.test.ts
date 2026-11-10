
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
    ensureSymbolMetadata
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
});
