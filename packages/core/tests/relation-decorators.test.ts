
import { describe, expect, it } from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    OneToMany,
    OneToOne,
    ManyToMany,
    JoinColumn,
    JoinTable,
    getRelationDeclarations,
    ensureSymbolMetadata
} from '../src/decorators';

ensureSymbolMetadata();

describe('Relation decorators', () => {
    it('should register a many-to-one declaration', () => {
        class User {
            orders!: Order[];
        }

        @Entity()
        class Order {
            @ManyToOne(() => User, user => user.orders, {
                nullable: false,
                onDelete: 'RESTRICT'
            })
            user!: User;
        }

        const declarations = getRelationDeclarations(Order);

        expect(declarations.relations).toHaveLength(1);

        const relation = declarations.relations[0];

        expect(relation?.type).toBe('many-to-one');
        expect(relation?.propertyKey).toBe('user');
        expect(relation?.target()).toBe(User);
        expect(relation?.options.nullable).toBe(false);
        expect(relation?.options.onDelete).toBe('RESTRICT');
    });

    it('should register a one-to-many declaration', () => {
        class Order {
            user!: User;
        }

        @Entity()
        class User {
            @OneToMany(() => Order, order => order.user)
            orders!: Order[];
        }

        const declarations = getRelationDeclarations(User);

        expect(declarations.relations[0]?.type)
            .toBe('one-to-many');

        expect(declarations.relations[0]?.target())
            .toBe(Order);
    });

    it('should register a one-to-one declaration', () => {
        class Profile { }

        @Entity()
        class User {
            @OneToOne(() => Profile)
            profile!: Profile;
        }

        const declarations = getRelationDeclarations(User);

        expect(declarations.relations[0]?.type)
            .toBe('one-to-one');
    });

    it('should register a many-to-many declaration', () => {
        class Role { }

        @Entity()
        class User {
            @ManyToMany(() => Role)
            roles!: Role[];
        }

        const declarations = getRelationDeclarations(User);

        expect(declarations.relations[0]?.type)
            .toBe('many-to-many');
    });

    it('should support a simple join column', () => {
        class User { }

        @Entity()
        class Order {
            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const declarations = getRelationDeclarations(Order);

        expect(declarations.joinColumns).toHaveLength(1);
        expect(declarations.joinColumns[0]?.columns)
            .toEqual([
                {
                    name: 'user_id',
                    referencedColumnName: 'id'
                }
            ]);
    });

    it('should support composite join columns', () => {
        class User { }

        @Entity()
        class Order {
            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: 'company_id',
                    referencedColumnName: 'companyId'
                },
                {
                    name: 'user_id',
                    referencedColumnName: 'id'
                }
            ])
            user!: User;
        }

        const declarations = getRelationDeclarations(Order);

        expect(declarations.joinColumns[0]?.columns)
            .toHaveLength(2);
    });

    it('should support join tables', () => {
        class Role { }

        @Entity()
        class User {
            @ManyToMany(() => Role)
            @JoinTable({
                name: 'user_roles',
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

        const declarations = getRelationDeclarations(User);

        expect(declarations.joinTables).toHaveLength(1);
        expect(declarations.joinTables[0]?.options.name)
            .toBe('user_roles');
        expect(
            declarations.joinTables[0]?.options.inverseJoinColumns
        ).toHaveLength(1);
    });

    it('should defer target resolution', () => {
        let resolutionCount = 0;

        class User { }

        @Entity()
        class Order {
            @ManyToOne(() => {
                resolutionCount++;
                return User;
            })
            user!: User;
        }

        expect(resolutionCount).toBe(0);

        const declarations = getRelationDeclarations(Order);

        expect(resolutionCount).toBe(0);

        expect(declarations.relations[0]?.target()).toBe(User);
        expect(resolutionCount).toBe(1);
    });

    it('should isolate inherited declarations', () => {
        class User { }
        class Role { }

        class BaseEntity {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order extends BaseEntity {
            @ManyToOne(() => User)
            user!: User;
        }

        @Entity()
        class Permission extends BaseEntity {
            @ManyToOne(() => Role)
            role!: Role;
        }

        const order = getRelationDeclarations(Order);
        const permission = getRelationDeclarations(Permission);

        expect(order.relations.map(r => r.propertyKey))
            .toEqual(['user']);

        expect(permission.relations.map(r => r.propertyKey))
            .toEqual(['role']);
    });

    it('should inherit relation declarations', () => {
        class User { }

        class BaseOrder {
            @ManyToOne(() => User)
            user!: User;
        }

        @Entity()
        class Order extends BaseOrder { }

        const declarations = getRelationDeclarations(Order);

        expect(declarations.relations).toHaveLength(1);
        expect(declarations.relations[0]?.propertyKey)
            .toBe('user');
    });

    it('should reject static relation fields', () => {
        class User { }

        expect(() => {
            @Entity()
            class Order {
                @ManyToOne(() => User)
                static user: User;
            }

            return Order;
        }).toThrow(/public instance fields/);
    });

    it('should reject private relation fields', () => {
        class User { }

        expect(() => {
            @Entity()
            class Order {
                @ManyToOne(() => User)
                #user!: User;
            }

            return Order;
        }).toThrow(/public instance fields/);
    });
});
