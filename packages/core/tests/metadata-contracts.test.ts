
import { describe, expect, it } from 'vitest';

import type {
    EntityMetadata,
    ColumnMetadata,
    PrimaryKeyMetadata
} from '../src/metadata';

describe('Metadata contracts', () => {
    it('should describe a column', () => {
        const column: ColumnMetadata = {
            propertyKey: 'name',
            columnName: 'full_name',
            type: 'string',
            length: 150,
            nullable: false,
            hasDefault: false,
            insertable: true,
            updatable: true
        };

        expect(column.propertyKey).toBe('name');
        expect(column.columnName).toBe('full_name');
        expect(column.type).toBe('string');
    });

    it('should describe a primary key', () => {
        const primaryKey: PrimaryKeyMetadata = {
            propertyKey: 'id',
            columnName: 'id',
            type: 'integer',
            nullable: false,
            hasDefault: false,
            insertable: true,
            updatable: false,
            generation: 'increment'
        };

        expect(primaryKey.generation).toBe('increment');
        expect(primaryKey.nullable).toBe(false);
    });

    it('should describe an entity', () => {
        class User {
            id!: number;
            name!: string;
        }

        const metadata: EntityMetadata<User> = {
            target: User,
            tableName: 'users',
            schema: 'public',
            columns: [],
            primaryKeys: []
        };

        expect(metadata.target).toBe(User);
        expect(metadata.tableName).toBe('users');
        expect(metadata.schema).toBe('public');
    });
});
