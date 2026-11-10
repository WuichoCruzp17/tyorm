import { describe, expect, it } from "vitest";

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
    ensureSymbolMetadata,
    Column,
} from "../src/decorators";

import { MetadataError, RelationMetadataResolver } from "../src/metadata";

ensureSymbolMetadata();
describe("RelationMetadataResolver", () => {
    it("should resolve a many-to-one relation", () => {
        @Entity({ name: "users" })
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToMany(() => Order, "user")
            orders!: Order[];
        }

        @Entity({ name: "orders" })
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User, "orders", {
                nullable: false,
                onDelete: "CASCADE",
            })
            @JoinColumn({
                name: "user_id",
                referencedColumnName: "id",
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        const result = resolver.resolve(Order);
        const relation = result.relations[0];

        expect(relation?.type).toBe("many-to-one");
        expect(relation?.isOwningSide).toBe(true);
        expect(relation?.inversePropertyKey).toBe("orders");
        expect(relation?.onDelete).toBe("CASCADE");

        expect(relation?.joinColumns).toEqual([
            {
                name: "user_id",
                referencedColumnName: "id",
            },
        ]);
    });

    it("should resolve inverse one-to-many relations", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToMany(() => Order, "user")
            orders!: Order[];
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User, "orders")
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.isOwningSide).toBe(false);
        expect(relation?.joinColumns).toHaveLength(0);
    });

    it("should resolve a many-to-many join table", () => {
        @Entity({ name: "roles" })
        class Role {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => User, "roles")
            users!: User[];
        }

        @Entity({ name: "users" })
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => Role, "users")
            @JoinTable({
                name: "user_roles",
                joinColumns: [{ name: "user_id", referencedColumnName: "id" }],
                inverseJoinColumns: [{ name: "role_id", referencedColumnName: "id" }],
            })
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role),
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.isOwningSide).toBe(true);
        expect(relation?.joinTable?.name).toBe("user_roles");
        expect(relation?.joinTable?.joinColumns).toHaveLength(1);
        expect(relation?.joinTable?.inverseJoinColumns).toHaveLength(1);
    });

    it("should reject missing destination entities", () => {
        class User { }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([getEntityMetadata(Order)]);

        expect(() => resolver.resolve(Order)).toThrow(MetadataError);
    });

    it("should reject missing inverse relations", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User, "orders" as keyof User)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(/does not exist/);
    });

    it("should reject incomplete composite joins", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            companyId!: string;

            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: "user_id",
                referencedColumnName: "id",
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(/complete primary key/);
    });

    it("should reject join tables on many-to-one", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            @JoinTable({ name: "invalid_table" })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(/requires ManyToMany/);
    });

    it("should reject function inverse selectors", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User, (user) => user.id)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(/Function inverse selectors/);
    });

    it("should accept one-to-one with one owner", () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => User, "profile")
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => Profile, "user")
            @JoinColumn({
                name: "profile_id",
                referencedColumnName: "id",
            })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile),
        ]);

        const userRelation = resolver.resolve(User).relations[0];
        const profileRelation = resolver.resolve(Profile).relations[0];

        expect(userRelation?.isOwningSide).toBe(true);
        expect(profileRelation?.isOwningSide).toBe(false);
    });

    it("should reject one-to-one with two owners", () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => User, "profile")
            @JoinColumn({ name: "user_id" })
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => Profile, "user")
            @JoinColumn({ name: "profile_id" })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile),
        ]);

        expect(() => resolver.resolve(User)).toThrow(
            /Both sides are configured as owners/,
        );
    });

    it("should reject one-to-one with two owners", () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => User, "profile")
            @JoinColumn({ name: "user_id" })
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => Profile, "user")
            @JoinColumn({ name: "profile_id" })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile),
        ]);

        expect(() => resolver.resolve(User)).toThrow(
            /Both sides are configured as owners/,
        );
    });

    it("should reject one-to-one without owner", () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => User, "profile")
            user!: User;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => Profile, "user")
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile),
        ]);

        expect(() => resolver.resolve(User)).toThrow(
            /Neither side is configured as owner/,
        );
    });

    it("should reject many-to-many with two owners", () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => User, "roles")
            @JoinTable({ name: "role_users" })
            users!: User[];
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => Role, "users")
            @JoinTable({ name: "user_roles" })
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role),
        ]);

        expect(() => resolver.resolve(User)).toThrow(
            /Both sides are configured as owners/,
        );
    });

    it("should reject many-to-many without owner", () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => User, "roles")
            users!: User[];
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => Role, "users")
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role),
        ]);

        expect(() => resolver.resolve(User)).toThrow(
            /Neither side is configured as owner/,
        );
    });

    it("should reject unidirectional many-to-many without owner", () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => Role)
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role),
        ]);

        expect(() => resolver.resolve(User)).toThrow(/must be the owning side/);
    });

    it("should reject referential actions on inverse side", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToMany(() => Order, "user", {
                onDelete: "CASCADE",
            })
            orders!: Order[];
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User, "orders")
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(User)).toThrow(
            /Referential actions are not allowed/,
        );
    });

    it("should accept complete composite join columns in any order", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            companyId!: string;

            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: "user_id",
                    referencedColumnName: "id",
                },
                {
                    name: "company_id",
                    referencedColumnName: "companyId",
                },
            ])
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        const relation = resolver.resolve(Order).relations[0];

        expect(relation?.joinColumns).toEqual([
            {
                name: "user_id",
                referencedColumnName: "id",
            },
            {
                name: "company_id",
                referencedColumnName: "companyId",
            },
        ]);
    });

    it("should reject duplicated referenced columns", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            companyId!: string;

            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn([
                {
                    name: "user_id",
                    referencedColumnName: "id",
                },
                {
                    name: "another_user_id",
                    referencedColumnName: "id",
                },
            ])
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(
            /Duplicate join column names/,
        );
    });

    it("should reject empty join column names", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: "   ",
                referencedColumnName: "id",
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(
            /Join column name cannot be empty/,
        );
    });

    it("should accept unidirectional one-to-one with owner", () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => Profile)
            @JoinColumn({
                name: "profile_id",
                referencedColumnName: "id",
            })
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile),
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.isOwningSide).toBe(true);
        expect(relation?.joinColumns[0]?.name).toBe("profile_id");
    });

    it("should reject unidirectional one-to-one without owner", () => {
        @Entity()
        class Profile {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @OneToOne(() => Profile)
            profile!: Profile;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Profile),
        ]);

        expect(() => resolver.resolve(User)).toThrow(/must be the owning side/);
    });

    it("should deeply freeze resolved join table metadata", () => {
        @Entity()
        class Role {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: "user_roles",
                joinColumns: [
                    {
                        name: "user_id",
                        referencedColumnName: "id",
                    },
                ],
                inverseJoinColumns: [
                    {
                        name: "role_id",
                        referencedColumnName: "id",
                    },
                ],
            })
            roles!: Role[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role),
        ]);

        const result = resolver.resolve(User);
        const relation = result.relations[0];

        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.relations)).toBe(true);
        expect(Object.isFrozen(relation)).toBe(true);
        expect(Object.isFrozen(relation?.joinTable)).toBe(true);
        expect(Object.isFrozen(relation?.joinTable?.joinColumns)).toBe(true);
        expect(Object.isFrozen(relation?.joinTable?.joinColumns[0])).toBe(true);
        expect(Object.isFrozen(relation?.joinTable?.inverseJoinColumns[0])).toBe(
            true,
        );
    });

    it("should reject inferred FK collision with physical column", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @Column({ type: "uuid", name: "user_id" })
            userId!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(
            /Inferred foreign key column/,
        );
    });

    it("should accept explicitly mapped FK column", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @Column({ type: "uuid", name: "user_id" })
            userId!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: "user_id",
                referencedColumnName: "id",
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(resolver.resolve(Order).relations[0]?.joinColumns[0]?.name).toBe(
            "user_id",
        );
    });

    it("should reject FK collision with primary key", () => {
        @Entity()
        class User {
            @PrimaryKey({ type: "uuid" })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: "uuid" })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: "id",
                referencedColumnName: "id",
            })
            user!: User;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order),
        ]);

        expect(() => resolver.resolve(Order)).toThrow(
            /conflicts with a primary key/,
        );
    });


    it('should accept FK without physical column collision', () => {
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

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const relation = resolver.resolve(Order).relations[0];

        expect(relation?.joinColumns[0]?.name).toBe('user_id');
    });


    it('should infer join table column names', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'users_roles'
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.joinTable?.joinColumns[0]?.name)
            .toBe('users_id');

        expect(relation?.joinTable?.inverseJoinColumns[0]?.name)
            .toBe('roles_id');
    });


    it('should preserve explicit join table column names', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'users_roles',
                joinColumns: [
                    {
                        name: 'custom_user_id',
                        referencedColumnName: 'id'
                    }
                ],
                inverseJoinColumns: [
                    {
                        name: 'custom_role_id',
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

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        const relation = resolver.resolve(User).relations[0];

        expect(relation?.joinTable?.joinColumns[0]?.name)
            .toBe('custom_user_id');

        expect(relation?.joinTable?.inverseJoinColumns[0]?.name)
            .toBe('custom_role_id');
    });


    it('should infer composite join table columns', () => {
        @Entity({ name: 'members' })
        class Member {
            @PrimaryKey({ type: 'uuid' })
            companyId!: string;

            @PrimaryKey({ type: 'uuid' })
            memberId!: string;

            @ManyToMany(() => Permission)
            @JoinTable({
                name: 'member_permissions'
            })
            permissions!: Permission[];
        }

        @Entity({ name: 'permissions' })
        class Permission {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(Member),
            getEntityMetadata(Permission)
        ]);

        const relation = resolver.resolve(Member).relations[0];

        const columns = relation?.joinTable?.joinColumns;

        expect(columns).toHaveLength(2);

        expect(columns?.map(column => column.name)).toEqual([
            'members_companyId',
            'members_memberId'
        ]);
    });



    it('should infer self-referencing many-to-many columns', () => {
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

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User)
        ]);

        const relation = resolver.resolve(User).relations[0];
        const joinTable = relation?.joinTable;

        expect(joinTable?.joinColumns[0]?.name)
            .toBe('source_users_id');

        expect(joinTable?.inverseJoinColumns[0]?.name)
            .toBe('target_users_id');
    });


    it('should infer self-referencing composite join columns', () => {
        @Entity({ name: 'nodes' })
        class Node {
            @PrimaryKey({ type: 'uuid' })
            treeId!: string;

            @PrimaryKey({ type: 'uuid' })
            nodeId!: string;

            @ManyToMany(() => Node)
            @JoinTable({
                name: 'node_connections'
            })
            connections!: Node[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(Node)
        ]);

        const joinTable =
            resolver.resolve(Node).relations[0]?.joinTable;

        expect(
            joinTable?.joinColumns.map(column => column.name)
        ).toEqual([
            'source_nodes_treeId',
            'source_nodes_nodeId'
        ]);

        expect(
            joinTable?.inverseJoinColumns.map(column => column.name)
        ).toEqual([
            'target_nodes_treeId',
            'target_nodes_nodeId'
        ]);
    });


    it('should preserve explicit self-referencing join columns', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => User)
            @JoinTable({
                name: 'user_connections',
                joinColumns: [
                    {
                        name: 'parent_user_id',
                        referencedColumnName: 'id'
                    }
                ],
                inverseJoinColumns: [
                    {
                        name: 'child_user_id',
                        referencedColumnName: 'id'
                    }
                ]
            })
            connections!: User[];
        }

        const resolver = new RelationMetadataResolver([
            getEntityMetadata(User)
        ]);

        const joinTable =
            resolver.resolve(User).relations[0]?.joinTable;

        expect(joinTable?.joinColumns[0]?.name)
            .toBe('parent_user_id');

        expect(joinTable?.inverseJoinColumns[0]?.name)
            .toBe('child_user_id');
    });



});
