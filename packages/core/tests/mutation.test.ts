import { describe, expect, it } from 'vitest';
import { Column, Entity, OrmMetadataModel, PrimaryKey, getEntityMetadata, resolveMutation } from '../src';

@Entity({ name: 'documents', schema: 'app' })
class Document {
    @PrimaryKey({ type: 'integer', name: 'doc_id', generation: 'increment' })
    id!: number;

    @PrimaryKey({ type: 'integer', name: 'tenant_id' })
    tenant!: number;

    @Column({ type: 'string', name: 'doc_title' })
    title!: string;

    @Column({ type: 'string', default: 'draft', updatable: false })
    status!: string;
}

const model = new OrmMetadataModel([getEntityMetadata(Document)]);

describe('resolveMutation', () => {
    it('resolves physical names, applies defaults and returns generated keys', () => {
        expect(resolveMutation(model, {
            kind: 'insert', entity: Document, values: { tenant: 2, title: 'Draft' }
        })).toEqual({
            kind: 'insert', table: 'documents', schema: 'app',
            primaryKeys: expect.arrayContaining([expect.objectContaining({ columnName: 'doc_id', generation: 'increment' })]),
            values: [
                { column: 'tenant_id', value: 2 },
                { column: 'doc_title', value: 'Draft' },
                { column: 'status', value: 'draft' }
            ],
            returning: [
                { column: 'doc_id', alias: 'id' },
                { column: 'tenant_id', alias: 'tenant' },
                { column: 'doc_title', alias: 'title' },
                { column: 'status', alias: 'status' }
            ]
        });
    });

    it('requires all key components and writable values', () => {
        const key = { id: 1, tenant: 2 };
        expect(resolveMutation(model, { kind: 'delete', entity: Document, key })).toMatchObject({
            key: [{ column: 'doc_id', value: 1 }, { column: 'tenant_id', value: 2 }]
        });
        expect(() => resolveMutation(model, { kind: 'delete', entity: Document, key: { id: 1 } }))
            .toThrow('exactly the primary-key properties');
        for (const values of [{ id: 2 }, { status: 'active' }, { title: null }, { title: undefined }, {}]) {
            expect(() => resolveMutation(model, { kind: 'update', entity: Document, key, values })).toThrow();
        }
        expect(() => resolveMutation(model, { kind: 'insert', entity: Document, values: { tenant: 2 } }))
            .toThrow('Missing required insert property "title".');
        expect(() => resolveMutation(model, {
            kind: 'insert', entity: Document, values: { id: 1, tenant: 2, title: 'Draft' }
        })).toThrow('Property "id" is not writable');
    });
});

@Entity({ name: 'settings' })
class Setting {
    @PrimaryKey({ type: 'string', name: 'setting_key' })
    key!: string;

    @Column({ type: 'string', default: 'default' })
    value!: string;
}

describe('save resolution', () => {
    it('inserts a generated key only when absent and requires the full existing key', () => {
        expect(resolveMutation(model, {
            kind: 'save', entity: Document, values: { tenant: 2, title: 'New' }
        })).toMatchObject({ kind: 'insert' });
        expect(resolveMutation(model, {
            kind: 'save', entity: Document, values: { id: 1, tenant: 2, title: 'Edited', status: 'ignored' }
        })).toMatchObject({
            kind: 'update',
            key: [{ column: 'doc_id', value: 1 }, { column: 'tenant_id', value: 2 }],
            values: [{ column: 'doc_title', value: 'Edited' }]
        });
        expect(() => resolveMutation(model, {
            kind: 'save', entity: Document, values: { id: 1, title: 'Edited' }
        })).toThrow('all primary-key values');
    });

    it('uses assigned keys as conflict targets and applies omitted defaults only on insert', () => {
        const settings = new OrmMetadataModel([getEntityMetadata(Setting)]);
        expect(resolveMutation(settings, {
            kind: 'save', entity: Setting, values: { key: 'locale' }
        })).toMatchObject({
            kind: 'upsert',
            conflictColumns: ['setting_key'],
            values: [{ column: 'setting_key', value: 'locale' }, { column: 'value', value: 'default' }],
            assignments: []
        });
        expect(() => resolveMutation(settings, { kind: 'save', entity: Setting, values: {} }))
            .toThrow('requires an insertable value for primary key');
    });
});
