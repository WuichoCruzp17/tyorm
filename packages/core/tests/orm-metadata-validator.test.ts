
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
    ManyToOne,
    JoinColumn
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


    it('should resolve foreign key target using target factory', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const relation = model.getEntity(Order).relations[0];

        expect(relation?.target()).toBe(User);
    });

    it('should accept matching foreign key types', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({
                type: 'uuid',
                name: 'user_id',
                insertable: false,
                updatable: false
            })
            userId!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(model.getEntity(Order).relations)
            .toHaveLength(1);
    });
    it('should reject incompatible foreign key types', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({
                type: 'integer',
                name: 'user_id'
            })
            userId!: number;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(/Foreign key type mismatch/);
    });


    it('should accept composite FK with custom physical names', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'company_id'
            })
            companyId!: string;

            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            userId!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({
                type: 'uuid',
                name: 'order_id'
            })
            id!: string;


            @Column({
                type: 'uuid',
                name: 'customer_company_id',
                insertable: false,
                updatable: false
            })
            customerCompanyId!: string;

            @Column({
                type: 'uuid',
                name: 'customer_user_id',
                insertable: false,
                updatable: false
            })
            customerUserId!: string;


            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: 'customer_company_id',
                    referencedColumnName: 'company_id'
                },
                {
                    name: 'customer_user_id',
                    referencedColumnName: 'user_id'
                }
            ])
            customer!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const relation =
            model.getEntity(Order).relations[0];

        expect(
            relation?.joinColumns.map(column => column.name)
        ).toEqual([
            'customer_company_id',
            'customer_user_id'
        ]);

        expect(
            relation?.joinColumns.map(
                column => column.referencedColumnName
            )
        ).toEqual([
            'company_id',
            'user_id'
        ]);
    });

    it('should reject incompatible type in composite FK', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'company_id'
            })
            companyId!: string;

            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            userId!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({
                type: 'uuid',
                name: 'order_id'
            })
            id!: string;

            @Column({
                type: 'uuid',
                name: 'customer_company_id'
            })
            customerCompanyId!: string;

            @Column({
                type: 'integer',
                name: 'customer_user_id'
            })
            customerUserId!: number;

            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: 'customer_company_id',
                    referencedColumnName: 'company_id'
                },
                {
                    name: 'customer_user_id',
                    referencedColumnName: 'user_id'
                }
            ])
            customer!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(/Foreign key type mismatch/);
    });


    it('should reject composite FK referencing non-primary column', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'company_id'
            })
            companyId!: string;

            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            userId!: string;

            @Column({
                type: 'string',
                name: 'email'
            })
            email!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({
                type: 'uuid',
                name: 'order_id'
            })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: 'customer_company_id',
                    referencedColumnName: 'company_id'
                },
                {
                    name: 'customer_email',
                    referencedColumnName: 'email'
                }
            ])
            customer!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow();
    });


    it('should reject writable scalar column sharing a foreign key', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({
                type: 'uuid',
                name: 'user_id'
            })
            userId!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(/Shared column write conflict/);
    });


    it('should accept read-only scalar column sharing a foreign key', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({
                type: 'uuid',
                name: 'user_id',
                insertable: false,
                updatable: false
            })
            userId!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(model.getEntity(Order).relations)
            .toHaveLength(1);
    });


    it('should reject partially writable shared foreign key column', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({
                type: 'uuid',
                name: 'user_id',
                insertable: false,
                updatable: true
            })
            userId!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(/Shared column write conflict/);
    });


    it('should accept foreign key owned only by relation', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
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

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(model.getEntity(Order).relations)
            .toHaveLength(1);
    });


    it('should reject shared primary key foreign key without explicit mapping', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'profiles' })
        class Profile {
            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            userId!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Profile)
        ])).toThrow();
    });


    it('should reject two owning relations sharing the same FK column', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'owner_id',
                referencedColumnName: 'id'
            })
            owner!: User;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'owner_id',
                referencedColumnName: 'id'
            })
            reviewer!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(/Duplicate local join column "owner_id"/);
    });


    it('should accept owning relations with distinct FK columns', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'owner_id',
                referencedColumnName: 'id'
            })
            owner!: User;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'reviewer_id',
                referencedColumnName: 'id'
            })
            reviewer!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        expect(model.getEntity(Order).relations)
            .toHaveLength(2);
    });


    it('should reject overlapping composite FK columns', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'company_id'
            })
            companyId!: string;

            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            userId!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: 'owner_company_id',
                    referencedColumnName: 'company_id'
                },
                {
                    name: 'owner_user_id',
                    referencedColumnName: 'user_id'
                }
            ])
            owner!: User;

            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: 'owner_company_id',
                    referencedColumnName: 'company_id'
                },
                {
                    name: 'reviewer_user_id',
                    referencedColumnName: 'user_id'
                }
            ])
            reviewer!: User;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ])).toThrow(
            /Duplicate local join column "owner_company_id"/
        );
    });



});
