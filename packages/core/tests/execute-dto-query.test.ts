import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
    column,
    count,
    Entity,
    executeDtoQuery,
    executeProjectionQuery,
    getEntityMetadata,
    OrmMetadataModel,
    param,
    PrimaryKey,
    QueryAstError,
    QuerySemanticError,
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

class UserSummary {
    constructor(
        readonly id: number,
        readonly total: bigint | null
    ) { }
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
    const execute = vi.spyOn(executor, 'execute');
    return { query, resolver, compiled, compile, executor, execute };
}

describe('executeProjectionQuery', () => {
    it('infers aliases and returns only the projected driver values', async () => {
        const { query, resolver, compile, executor } = createFixture([
            { userId: 2, total: '5', extra: 'ignored' },
            { userId: 1, total: null }
        ]);
        const rows = await executeProjectionQuery(executor, resolver, { compile }, query, {
            userId: column('u', 'id'),
            total: count()
        });

        expectTypeOf(rows).toEqualTypeOf<Readonly<Record<'userId' | 'total', unknown>>[]>();
        expect(rows).toEqual([{ userId: 2, total: '5' }, { userId: 1, total: null }]);
    });

    it('rejects an alias missing from the result', async () => {
        const { query, resolver, compile, executor } = createFixture([{ user_id: 1 }]);

        await expect(executeProjectionQuery(executor, resolver, { compile }, query, {
            userId: column('u', 'id')
        })).rejects.toThrow('Missing DTO projection alias "userId" in query result.');
    });
});

describe('executeDtoQuery', () => {
    it('resolves aliases, forwards parameters and maps rows in order', async () => {
        const { query, resolver, compiled, compile, executor, execute } = createFixture([
            { userId: 2, total: '5', extra: 'ignored' },
            { userId: 1, total: null }
        ]);
        const select = { userId: column('u', 'id'), total: count() };
        const parameters = { limit: 1 };
        const having = {
            kind: 'comparison',
            operator: 'gt',
            left: select.total,
            right: param('limit')
        } as const;

        const summaries = await executeDtoQuery(
            executor, resolver, { compile }, { ...query, having },
            {
                select,
                map: row => {
                    expectTypeOf(row).toEqualTypeOf<
                        Readonly<Record<'userId' | 'total', unknown>>
                    >();
                    expect(Object.keys(row)).toEqual(['userId', 'total']);
                    const { userId, total } = row;
                    if (typeof userId !== 'number' ||
                        (typeof total !== 'string' && total !== null)) {
                        throw new TypeError('Unexpected summary values.');
                    }
                    return new UserSummary(userId, total === null ? null : BigInt(total));
                }
            },
            parameters
        );

        expectTypeOf(summaries).toEqualTypeOf<UserSummary[]>();
        expect(summaries).toEqual([new UserSummary(2, 5n), new UserSummary(1, null)]);
        expect(summaries[0]).toBeInstanceOf(UserSummary);
        expect(compile).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                query: expect.objectContaining({
                    selections: [
                        { alias: 'userId', expression: select.userId },
                        { alias: 'total', expression: select.total }
                    ],
                    having
                }),
                columns: expect.arrayContaining([
                    expect.objectContaining({ property: 'id', columnName: 'user_id' })
                ])
            }),
            parameters
        );
        expect(execute).toHaveBeenCalledExactlyOnceWith(compiled);
    });

    it('returns an empty array without calling the mapper when no rows match', async () => {
        const { query, resolver, compile, executor } = createFixture();
        const map = vi.fn();

        await expect(executeDtoQuery(executor, resolver, { compile }, query, {
            select: { id: column('u', 'id') },
            map
        })).resolves.toEqual([]);
        expect(map).not.toHaveBeenCalled();
    });

    it('rejects an empty projection before compiling or executing SQL', async () => {
        const { query, resolver, compile, executor, execute } = createFixture();

        await expect(executeDtoQuery(executor, resolver, { compile }, query, {
            select: {},
            map: vi.fn()
        })).rejects.toThrow(new QueryAstError('DTO projection requires at least one selection.'));
        expect(compile).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects unknown properties before compiling or executing SQL', async () => {
        const { query, resolver, compile, executor, execute } = createFixture();

        await expect(executeDtoQuery(executor, resolver, { compile }, query, {
            select: { id: column('u', 'missing') },
            map: vi.fn()
        })).rejects.toThrow(QuerySemanticError);
        expect(compile).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([
        ['absent', {}],
        ['inherited', Object.setPrototypeOf({}, { id: 1 })]
    ] as const)('rejects an %s alias before mapping the row', async (_label, row) => {
        const { query, resolver, compile, executor } = createFixture([row]);
        const map = vi.fn();

        await expect(executeDtoQuery(executor, resolver, { compile }, query, {
            select: { id: column('u', 'id') },
            map
        })).rejects.toThrow('Missing DTO projection alias "id" in query result.');
        expect(map).not.toHaveBeenCalled();
    });

    it('preserves errors thrown by the mapper', async () => {
        const { query, resolver, compile, executor } = createFixture([{ id: 1 }]);
        const error = new TypeError('Invalid DTO value.');

        await expect(executeDtoQuery(executor, resolver, { compile }, query, {
            select: { id: column('u', 'id') },
            map: () => { throw error; }
        })).rejects.toBe(error);
    });

    it('preserves errors rejected by the executor', async () => {
        const { query, resolver, compile, executor, execute } = createFixture();
        const error = new Error('Connection closed.');
        execute.mockRejectedValueOnce(error);
        const map = vi.fn();

        await expect(executeDtoQuery(executor, resolver, { compile }, query, {
            select: { id: column('u', 'id') },
            map
        })).rejects.toBe(error);
        expect(map).not.toHaveBeenCalled();
    });
});
