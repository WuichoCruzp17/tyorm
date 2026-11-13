
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Column,
    Entity,
    PrimaryKey,
    getEntityMetadata
} from '../src/decorators';

import {
    ensureSymbolMetadata
} from '../src/runtime';

import {
    MetadataError,
    MetadataRegistry
} from '../src/metadata';

// Debe ejecutarse antes de evaluar las clases.
ensureSymbolMetadata();

describe('Standard decorators', () => {
    it('should extract entity metadata', () => {
        @Entity({ name: 'users', schema: 'public' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                generation: 'uuid'
            })
            id!: string;

            @Column({ type: 'string', length: 150 })
            name!: string;
        }

        const metadata = getEntityMetadata(User);

        expect(metadata.target).toBe(User);
        expect(metadata.tableName).toBe('users');
        expect(metadata.schema).toBe('public');
        expect(metadata.columns).toHaveLength(1);
        expect(metadata.primaryKeys).toHaveLength(1);
        expect(metadata.columns[0]?.columnName).toBe('name');
        expect(metadata.primaryKeys[0]?.generation).toBe('uuid');
    });

    it('should normalize default column options', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'integer' })
            id!: number;

            @Column({ type: 'string' })
            name!: string;
        }

        const metadata = getEntityMetadata(User);
        const column = metadata.columns[0];

        expect(column?.nullable).toBe(false);
        expect(column?.hasDefault).toBe(false);
        expect(column?.insertable).toBe(true);
        expect(column?.updatable).toBe(true);
        expect(metadata.primaryKeys[0]?.generation).toBe('none');
    });

    it('should preserve explicit default values', () => {
        @Entity()
        class Settings {
            @PrimaryKey({ type: 'integer' })
            id!: number;

            @Column({
                type: 'boolean',
                default: false
            })
            enabled!: boolean;
        }

        const metadata = getEntityMetadata(Settings);
        const column = metadata.columns[0];

        expect(column?.hasDefault).toBe(true);
        expect(column?.defaultValue).toBe(false);
    });

    it('should support composite primary keys', () => {
        @Entity({ name: 'user_roles' })
        class UserRole {
            @PrimaryKey({ type: 'uuid' })
            userId!: string;

            @PrimaryKey({ type: 'uuid' })
            roleId!: string;
        }

        const metadata = getEntityMetadata(UserRole);

        expect(metadata.primaryKeys).toHaveLength(2);

        const registry = new MetadataRegistry();
        registry.register(metadata);

        expect(registry.get(UserRole).primaryKeys).toHaveLength(2);
    });

    it('should integrate with MetadataRegistry', () => {
        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({
                type: 'integer',
                generation: 'increment'
            })
            id!: number;

            @Column({
                type: 'string',
                length: 100
            })
            name!: string;
        }

        const registry = new MetadataRegistry();

        registry.register(getEntityMetadata(Role));

        expect(registry.has(Role)).toBe(true);
        expect(registry.getColumn(Role, 'name').length).toBe(100);
    });

    it('should inherit columns without mutating the parent', () => {
        class BaseEntity {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({ type: 'datetime' })
            createdAt!: Date;
        }

        @Entity({ name: 'users' })
        class User extends BaseEntity {
            @Column({ type: 'string' })
            name!: string;
        }

        const metadata = getEntityMetadata(User);

        expect(metadata.primaryKeys).toHaveLength(1);
        expect(metadata.columns.map(c => c.propertyKey))
            .toEqual(['createdAt', 'name']);

        const registry = new MetadataRegistry();
        registry.register(metadata);

        expect(registry.getColumns(User)).toHaveLength(3);
    });

    it('should keep sibling entities isolated', () => {
        class BaseEntity {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'users' })
        class User extends BaseEntity {
            @Column({ type: 'string' })
            name!: string;
        }

        @Entity({ name: 'roles' })
        class Role extends BaseEntity {
            @Column({ type: 'string' })
            code!: string;
        }

        const userMetadata = getEntityMetadata(User);
        const roleMetadata = getEntityMetadata(Role);

        expect(userMetadata.columns.map(c => c.propertyKey))
            .toEqual(['name']);

        expect(roleMetadata.columns.map(c => c.propertyKey))
            .toEqual(['code']);

        expect(userMetadata.primaryKeys).toHaveLength(1);
        expect(roleMetadata.primaryKeys).toHaveLength(1);
    });

    it('should reject classes without @Entity', () => {
        class User {
            @PrimaryKey({ type: 'integer' })
            id!: number;
        }

        expect(() => getEntityMetadata(User))
            .toThrow(MetadataError);
    });



    it('should detect duplicate inherited properties', () => {
        class BaseEntity {
            @PrimaryKey({ type: 'integer' })
            id!: number;

            @Column({ type: 'string' })
            code!: string;
        }

        @Entity({ name: 'users' })
        class User extends BaseEntity {
            @Column({ type: 'string' })
            override code: string = '';
        }

        const registry = new MetadataRegistry();

        expect(() =>
            registry.register(getEntityMetadata(User))
        ).toThrow(/Duplicate property/);
    });


});
