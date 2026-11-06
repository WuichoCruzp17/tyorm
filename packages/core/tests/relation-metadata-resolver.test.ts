
import { describe, expect, it } from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    OneToMany,
    ManyToMany,
    JoinColumn,
    JoinTable,
    OneToOne,
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


    it('should accept one-to-one with one owner', () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => User, 'profile')
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => Profile, 'user')
            @JoinColumn({
                name: 'profile_id',
                referencedColumnName: 'id'
            })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile)
        ]);

        const userRelation = resolver.resolve(User).relations[0];
        const profileRelation = resolver.resolve(Profile).relations[0];

        expect(userRelation?.isOwningSide).toBe(true);
        expect(profileRelation?.isOwningSide).toBe(false);
    });

    it('should reject one-to-one with two owners', () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => User, 'profile')
            @JoinColumn({ name: 'user_id' })
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => Profile, 'user')
            @JoinColumn({ name: 'profile_id' })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile)
        ]);

        expect(() => resolver.resolve(User))
            .toThrow(/Both sides are configured as owners/);
    });

    it('should reject one-to-one with two owners', () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => User, 'profile')
            @JoinColumn({ name: 'user_id' })
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => Profile, 'user')
            @JoinColumn({ name: 'profile_id' })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile)
        ]);

        expect(() => resolver.resolve(User))
            .toThrow(/Both sides are configured as owners/);
    });

    it('should reject one-to-one without owner', () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => User, 'profile')
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToOne(() => Profile, 'user')
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile)
        ]);

        expect(() => resolver.resolve(User))
            .toThrow(/Neither side is configured as owner/);
    });


    it('should reject many-to-many with two owners', () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => User, 'roles')
            @JoinTable({ name: 'role_users' })
            users!: User[];
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role, 'users')
            @JoinTable({ name: 'user_roles' })
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        expect(() => resolver.resolve(User))
            .toThrow(/Both sides are configured as owners/);
    });

    it('should reject many-to-many without owner', () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => User, 'roles')
            users!: User[];
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role, 'users')
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        expect(() => resolver.resolve(User))
            .toThrow(/Neither side is configured as owner/);
    });


    it('should reject unidirectional many-to-many without owner', () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        expect(() => resolver.resolve(User))
            .toThrow(/must be the owning side/);
    });

    it('should reject referential actions on inverse side', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @OneToMany(() => Order, 'user', {
                onDelete: 'CASCADE'
            })
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

        expect(() => resolver.resolve(User))
            .toThrow(/Referential actions are not allowed/);
    });

});
