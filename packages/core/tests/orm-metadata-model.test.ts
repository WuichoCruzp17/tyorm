
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    JoinColumn,
    getEntityMetadata,
    ensureSymbolMetadata,
    Column,
    ManyToMany,
    JoinTable
} from '../src/decorators';

import {
    MetadataError,
    OrmMetadataModel
} from '../src/metadata';

ensureSymbolMetadata();

describe('OrmMetadataModel', () => {
    it('should consolidate entities and relations', () => {
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

        const metadata = model.getEntity(Order);

        expect(metadata.entity.target).toBe(Order);
        expect(metadata.relations).toHaveLength(1);
        expect(metadata.relations[0]?.type)
            .toBe('many-to-one');
        expect(metadata.relations[0]?.joinColumns[0]?.name)
            .toBe('user_id');
    });

    it('should report registered entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        expect(model.hasEntity(User)).toBe(true);
        expect(model.getEntities()).toHaveLength(1);
    });

    it('should reject unknown entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        class Unknown { }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        expect(() => model.getEntity(Unknown))
            .toThrow(MetadataError);
    });

    it('should reject duplicate entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const metadata = getEntityMetadata(User);

        expect(() => new OrmMetadataModel([
            metadata,
            metadata
        ])).toThrow(/Duplicate entity:/);
    });

    it('should expose immutable ORM metadata', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const metadata = model.getEntity(User);
        const entities = model.getEntities();

        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(entities)).toBe(true);
        expect(Object.isFrozen(metadata.relations))
            .toBe(true);
    });


    it('should deeply freeze entity metadata snapshots', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            id!: string;

            @Column({
                type: 'string',
                name: 'full_name'
            })
            name!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const metadata = model.getEntity(User);

        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(metadata.entity)).toBe(true);

        expect(Object.isFrozen(metadata.entity.columns))
            .toBe(true);

        expect(Object.isFrozen(metadata.entity.primaryKeys))
            .toBe(true);

        for (const column of metadata.entity.columns) {
            expect(Object.isFrozen(column)).toBe(true);
        }

        for (const primaryKey of metadata.entity.primaryKeys) {
            expect(Object.isFrozen(primaryKey)).toBe(true);
        }
    });


    it('should deeply freeze relation metadata', () => {
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

        const metadata = model.getEntity(Order);
        const relation = metadata.relations[0]!;

        expect(Object.isFrozen(metadata.relations))
            .toBe(true);

        expect(Object.isFrozen(relation)).toBe(true);

        expect(Object.isFrozen(relation.joinColumns))
            .toBe(true);

        for (const column of relation.joinColumns) {
            expect(Object.isFrozen(column)).toBe(true);
        }
    });


    it('should deeply freeze join table metadata', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'user_roles',
                joinColumns: [{
                    name: 'user_id',
                    referencedColumnName: 'id'
                }],
                inverseJoinColumns: [{
                    name: 'role_id',
                    referencedColumnName: 'id'
                }]
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

        const relation =
            model.getEntity(User).relations[0]!;

        const joinTable = relation.joinTable!;

        expect(Object.isFrozen(joinTable)).toBe(true);

        expect(Object.isFrozen(joinTable.joinColumns))
            .toBe(true);

        expect(Object.isFrozen(joinTable.inverseJoinColumns))
            .toBe(true);

        for (const column of [
            ...joinTable.joinColumns,
            ...joinTable.inverseJoinColumns
        ]) {
            expect(Object.isFrozen(column)).toBe(true);
        }
    });


    it('should isolate entity metadata from source arrays', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({ type: 'string' })
            name!: string;
        }

        const source = getEntityMetadata(User);

        const model = new OrmMetadataModel([source]);

        const snapshot = model.getEntity(User).entity;

        expect(snapshot).not.toBe(source);

        expect(snapshot.columns).not.toBe(source.columns);

        expect(snapshot.primaryKeys)
            .not.toBe(source.primaryKeys);

        expect(snapshot.columns).toEqual(source.columns);

        expect(snapshot.primaryKeys)
            .toEqual(source.primaryKeys);
    });



});
