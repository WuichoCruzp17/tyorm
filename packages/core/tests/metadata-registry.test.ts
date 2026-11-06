
import { describe, expect, it } from 'vitest';

import {
    MetadataError,
    MetadataRegistry
} from '../src/metadata';

import type {
    EntityMetadata,
    ColumnMetadata,
    PrimaryKeyMetadata
} from '../src/metadata';

class User {
    id!: number;
    name!: string;
}

class Role {
    id!: number;
}

function createPrimaryKey(): PrimaryKeyMetadata {
    return {
        propertyKey: 'id',
        columnName: 'id',
        type: 'integer',
        nullable: false,
        hasDefault: false,
        insertable: true,
        updatable: false,
        generation: 'increment'
    };
}

function createColumn(): ColumnMetadata {
    return {
        propertyKey: 'name',
        columnName: 'name',
        type: 'string',
        length: 150,
        nullable: false,
        hasDefault: false,
        insertable: true,
        updatable: true
    };
}

function createMetadata(): EntityMetadata<User> {
    return {
        target: User,
        tableName: 'users',
        schema: 'public',
        columns: [createColumn()],
        primaryKeys: [createPrimaryKey()]
    };
}

describe('MetadataRegistry', () => {
    it('should register and retrieve entity metadata', () => {
        const registry = new MetadataRegistry();
        const metadata = createMetadata();

        registry.register(metadata);

        expect(registry.has(User)).toBe(true);
        expect(registry.get(User).tableName).toBe('users');
        expect(registry.size).toBe(1);
    });

    it('should return undefined for an unknown entity', () => {
        const registry = new MetadataRegistry();

        expect(registry.find(User)).toBeUndefined();
    });

    it('should throw when getting an unknown entity', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.get(User))
            .toThrow(MetadataError);
    });

    it('should reject duplicate entity registration', () => {
        const registry = new MetadataRegistry();

        registry.register(createMetadata());

        expect(() => registry.register(createMetadata()))
            .toThrow(/already registered/);
    });

    it('should reject two entities mapped to the same table', () => {
        const registry = new MetadataRegistry();

        registry.register(createMetadata());

        expect(() => registry.register({
            target: Role,
            tableName: 'users',
            schema: 'public',
            columns: [],
            primaryKeys: [createPrimaryKey()]
        })).toThrow(/already mapped/);
    });

    it('should allow the same table name in different schemas', () => {
        const registry = new MetadataRegistry();

        registry.register(createMetadata());

        registry.register({
            target: Role,
            tableName: 'users',
            schema: 'other',
            columns: [],
            primaryKeys: [createPrimaryKey()]
        });

        expect(registry.size).toBe(2);
    });

    it('should reject entities without primary keys', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            primaryKeys: []
        })).toThrow(/must have a primary key/);
    });

    it('should reject duplicate property keys', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            columns: [
                createColumn(),
                {
                    ...createColumn(),
                    columnName: 'other_name'
                }
            ]
        })).toThrow(/Duplicate property/);
    });

    it('should reject duplicate database column names', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            columns: [
                createColumn(),
                {
                    ...createColumn(),
                    propertyKey: 'otherName'
                }
            ]
        })).toThrow(/Duplicate database column/);
    });

    it('should reject invalid column length', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            columns: [{
                ...createColumn(),
                length: -1
            }]
        })).toThrow(/invalid length/);
    });

    it('should reject invalid decimal scale', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            columns: [{
                ...createColumn(),
                type: 'decimal',
                length: undefined,
                precision: 5,
                scale: 8
            }]
        })).toThrow(/invalid scale/);
    });

    it('should reject nullable primary keys', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            primaryKeys: [{
                ...createPrimaryKey(),
                nullable: true
            } as unknown as PrimaryKeyMetadata]
        })).toThrow(/cannot be nullable/);
    });

    it('should reject invalid primary key generation', () => {
        const registry = new MetadataRegistry();

        expect(() => registry.register({
            ...createMetadata(),
            primaryKeys: [{
                ...createPrimaryKey(),
                type: 'string'
            }]
        })).toThrow(/requires integer or bigint/);
    });

    it('should retrieve columns including primary keys', () => {
        const registry = new MetadataRegistry();

        registry.register(createMetadata());

        const columns = registry.getColumns(User);

        expect(columns).toHaveLength(2);
        expect(columns.map(column => column.propertyKey))
            .toEqual(['id', 'name']);

        expect(registry.getColumn(User, 'name').columnName)
            .toBe('name');
    });

    it('should reject unknown columns', () => {
        const registry = new MetadataRegistry();

        registry.register(createMetadata());

        expect(() => registry.getColumn(User, 'email'))
            .toThrow(/does not exist/);
    });

    it('should isolate registered metadata from input mutations', () => {
        const registry = new MetadataRegistry();
        const metadata = createMetadata();

        registry.register(metadata);

        (metadata.columns as ColumnMetadata[]).push({
            ...createColumn(),
            propertyKey: 'email',
            columnName: 'email'
        });

        expect(registry.get(User).columns).toHaveLength(1);
    });

    it('should freeze registered metadata', () => {
        const registry = new MetadataRegistry();

        registry.register(createMetadata());

        const metadata = registry.get(User);

        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(metadata.columns)).toBe(true);
        expect(Object.isFrozen(metadata.columns[0])).toBe(true);
    });

    it('should keep different registry instances isolated', () => {
        const first = new MetadataRegistry();
        const second = new MetadataRegistry();

        first.register(createMetadata());

        expect(first.has(User)).toBe(true);
        expect(second.has(User)).toBe(false);
    });

    it('should omit schema when it is not defined', () => {
        const registry = new MetadataRegistry();

        const { schema: _schema, ...metadata } = createMetadata();

        registry.register(metadata);

        const registered = registry.get(User);

        expect(registered.schema).toBeUndefined();
        expect(Object.hasOwn(registered, 'schema')).toBe(false);
    });
});
