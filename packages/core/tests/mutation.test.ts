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
