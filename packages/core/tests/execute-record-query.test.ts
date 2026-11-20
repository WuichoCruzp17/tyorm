import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
    column,
    count,
    defineRecord,
    executeRecordQuery,
    Entity,
    getEntityMetadata,
    OrmMetadataModel,
    PrimaryKey,
    QuerySemanticResolver,
    type DatabaseConnection,
    type QueryResult,
    type SelectQuery,
    type SqlCompiler
} from '../src';

@Entity({ name: 'users' })
class User {
    @PrimaryKey({ name: 'user_id', type: 'integer' })
    id!: number;
}

function createFixture(rows: Record<string, unknown>[] = []) {
    const query: Omit<SelectQuery, 'selections'> = {
        kind: 'select',
        from: { entity: User, alias: 'u' },
        joins: [],
        orderBy: [],
        groupBy: [column('u', 'id')],
        distinct: false
    };
    const resolver = new QuerySemanticResolver(new OrmMetadataModel([
        getEntityMetadata(User)
    ]));
    const compiled = { sql: 'SELECT fixture', parameters: [1] };
    const compile = vi.fn<SqlCompiler['compile']>().mockReturnValue(compiled);
    const executor: Pick<DatabaseConnection, 'execute'> = {
        async execute<T>(): Promise<QueryResult<T>> {
            return { rows: rows as T[], affectedRows: rows.length };
        }
    };
    return { query, resolver, compile, executor };
}

describe('defineRecord', () => {
    it('snapshots and freezes the schema while preserving the decoder', () => {
        const decode = (value: unknown) => String(value);
        const fields = { label: decode };
        const schema = defineRecord(fields);

        fields.label = () => 'changed';

        expect(schema).not.toBe(fields);
        expect(Object.isFrozen(schema)).toBe(true);
        expect(schema.label).toBe(decode);
    });
});

describe('executeRecordQuery', () => {
    const schema = defineRecord({
        memberId: value => {
            if (typeof value !== 'number') {
                throw new TypeError('Expected a numeric member ID.');
            }
            return value;
        },
        total: value => value === null ? null : BigInt(String(value))
    });

    it('reuses a schema with different selections and infers readonly fields', async () => {
        const { query, resolver, compile, executor } = createFixture([
            { memberId: 2, total: '5' },
            { memberId: 1, total: null }
        ]);
        const id = column('u', 'id');
        const rows = await executeRecordQuery(executor, resolver, { compile }, query, schema, {
            memberId: id,
            total: count()
        });
        await executeRecordQuery(executor, resolver, { compile }, query, schema, {
            memberId: id,
            total: count(id)
        });

        expectTypeOf(rows).toEqualTypeOf<
            { readonly memberId: number; readonly total: bigint | null }[]
        >();
        expect(rows).toEqual([{ memberId: 2, total: 5n }, { memberId: 1, total: null }]);
        expect(Object.isFrozen(rows[0])).toBe(true);
        expect(compile.mock.calls.map(([resolved]) => resolved.query.selections[1]?.expression))
            .toEqual([count(), count(id)]);
    });

    it('rejects missing and extra bindings before compiling', async () => {
        const { query, resolver, compile, executor } = createFixture();
        const id = column('u', 'id');
        const incomplete = { memberId: id };
        const extra = { memberId: id, total: count(), unknown: id };

        await expect(executeRecordQuery(
            executor, resolver, { compile }, query, schema,
            // @ts-expect-error Each schema field requires a selection.
            incomplete
        )).rejects.toThrow('Missing record selection "total".');
        await expect(executeRecordQuery(
            executor, resolver, { compile }, query, schema, extra
        )).rejects.toThrow('Unknown record selection "unknown".');
        expect(compile).not.toHaveBeenCalled();
    });

    it('does not decode fields when the query returns no rows', async () => {
        const { query, resolver, compile, executor } = createFixture();
        const decode = vi.fn();
        const record = defineRecord({ id: decode });

        const rows = await executeRecordQuery(executor, resolver, { compile }, query, record, {
            id: column('u', 'id')
        });

        expect(rows).toEqual([]);
        expect(decode).not.toHaveBeenCalled();
    });

    it('rejects a missing result alias before calling any decoder', async () => {
        const { query, resolver, compile, executor } = createFixture([{ id: 1 }]);
        const decode = vi.fn();
        const record = defineRecord({ id: decode, total: decode });

        await expect(executeRecordQuery(executor, resolver, { compile }, query, record, {
            id: column('u', 'id'),
            total: count()
        })).rejects.toThrow('Missing DTO projection alias "total" in query result.');
        expect(decode).not.toHaveBeenCalled();
    });

    it('propagates decoder errors', async () => {
        const { query, resolver, compile, executor } = createFixture([
            { memberId: 'invalid', total: '5' }
        ]);
        await expect(executeRecordQuery(executor, resolver, { compile }, query, schema, {
            memberId: column('u', 'id'),
            total: count()
        })).rejects.toThrow('Expected a numeric member ID.');
    });
});
