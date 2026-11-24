import { beforeEach, expect, it, vi } from 'vitest';
import { SqlServerConnection } from '../src/connection/sqlserver-connection';

const mocks = vi.hoisted(() => {
    const request = {
        input: vi.fn(function (this: unknown) { return this; }),
        output: vi.fn(function (this: unknown) { return this; }),
        query: vi.fn()
    };
    const transaction = {
        begin: vi.fn(),
        request: vi.fn(() => request),
        commit: vi.fn(),
        rollback: vi.fn()
    };
    const Transaction = vi.fn(function () { return transaction; });
    const isolation = {
        READ_UNCOMMITTED: 1,
        READ_COMMITTED: 2,
        REPEATABLE_READ: 3,
        SERIALIZABLE: 4
    };
    const sqlTypes = {
        NVarChar: vi.fn((length: number) => ({ kind: 'NVarChar', length })),
        Int: vi.fn(() => ({ kind: 'Int' })),
        BigInt: vi.fn(() => ({ kind: 'BigInt' })),
        Decimal: vi.fn((precision: number, scale: number) => ({ kind: 'Decimal', precision, scale })),
        Float: vi.fn(() => ({ kind: 'Float' })),
        Bit: vi.fn(() => ({ kind: 'Bit' })),
        Date: vi.fn(() => ({ kind: 'Date' })),
        Time: vi.fn((scale: number) => ({ kind: 'Time', scale })),
        DateTime2: vi.fn((scale: number) => ({ kind: 'DateTime2', scale })),
        UniqueIdentifier: vi.fn(() => ({ kind: 'UniqueIdentifier' })),
        VarBinary: vi.fn((length: number) => ({ kind: 'VarBinary', length }))
    };
    return { request, transaction, Transaction, isolation, sqlTypes };
});

vi.mock('mssql', () => ({
    Transaction: mocks.Transaction,
    ISOLATION_LEVEL: mocks.isolation,
    MAX: -1,
    default: {
        Transaction: mocks.Transaction,
        ISOLATION_LEVEL: mocks.isolation,
        MAX: -1,
        ...mocks.sqlTypes
    }
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.query.mockResolvedValue({
        recordset: [{ id: 7 }],
        recordsets: [[{ id: 7 }]],
        output: {},
        rowsAffected: [1]
    });
    mocks.transaction.begin.mockResolvedValue(mocks.transaction);
    mocks.transaction.commit.mockResolvedValue(undefined);
    mocks.transaction.rollback.mockResolvedValue(undefined);
});

it('binds query values as named parameters and maps rows and affected counts', async () => {
    const pool = { request: vi.fn(() => mocks.request) };
    const connection = new SqlServerConnection(pool as never);

    await expect(connection.execute({
        sql: 'SELECT @p0, @p1',
        parameters: ["O'Brien", 42n]
    })).resolves.toEqual({ rows: [{ id: 7 }], affectedRows: 1 });
    expect(mocks.request.input).toHaveBeenNthCalledWith(1, 'p0', "O'Brien");
    expect(mocks.request.input).toHaveBeenNthCalledWith(2, 'p1', 42n);
    expect(mocks.request.query).toHaveBeenCalledWith('SELECT @p0, @p1');
});

it('uses the transaction-bound request and rolls back before release', async () => {
    const pool = { request: vi.fn(() => mocks.request) };
    const connection = new SqlServerConnection(pool as never);
    await connection.beginTransaction({ isolationLevel: 'SERIALIZABLE' });
    await connection.execute({ sql: 'SELECT 1' });
    await connection.release();

    expect(mocks.Transaction).toHaveBeenCalledWith(pool);
    expect(mocks.transaction.begin).toHaveBeenCalledWith(mocks.isolation.SERIALIZABLE);
    expect(mocks.transaction.request).toHaveBeenCalledOnce();
    expect(pool.request).not.toHaveBeenCalled();
    expect(mocks.transaction.rollback).toHaveBeenCalledOnce();
    expect(connection.isReleased).toBe(true);
});

it('rejects unsupported read-only transactions and invalid values', async () => {
    const pool = { request: vi.fn(() => mocks.request) };
    const connection = new SqlServerConnection(pool as never);

    await expect(connection.beginTransaction({ readOnly: true })).rejects.toThrow('does not support read-only');
    await expect(connection.execute({ sql: 'SELECT @p0', parameters: [undefined] }))
        .rejects.toThrow('cannot be undefined');
    await expect(connection.execute({ sql: 'SELECT @p0', parameters: [{}] }))
        .rejects.toThrow('Unsupported SQL Server parameter');
    expect(mocks.request.query).not.toHaveBeenCalled();
});

it('rejects operations after release and propagates rollback errors', async () => {
    const pool = { request: vi.fn(() => mocks.request) };
    const connection = new SqlServerConnection(pool as never);
    await connection.beginTransaction();
    const cause = new Error('rollback failed');
    mocks.transaction.rollback.mockRejectedValueOnce(cause);

    await expect(connection.release()).rejects.toBe(cause);
    await expect(connection.execute({ sql: 'SELECT 1' })).rejects.toThrow('unavailable');
});

it('binds typed OUT and INOUT parameters and returns all procedure result sets', async () => {
    const pool = { request: vi.fn(() => mocks.request) };
    const connection = new SqlServerConnection(pool as never);
    mocks.request.query.mockResolvedValueOnce({
        recordset: [{ found: 1 }],
        recordsets: [[{ found: 1 }], [{ count: 1 }]],
        output: { p1: 9, p2: 12 },
        rowsAffected: [1, 1]
    });

    await expect(connection.execute({
        sql: 'EXEC [dbo].[summarize] @p0, @p1 OUTPUT, @p2 OUTPUT',
        parameters: ['Ada', null, 3],
        procedureCall: {
            name: 'summarize',
            args: [
                'Ada',
                { mode: 'out', type: { type: 'integer' } },
                { mode: 'inout', value: 3, type: { type: 'decimal', precision: 8, scale: 2 } }
            ]
        }
    })).resolves.toEqual({
        rows: [{ found: 1 }],
        affectedRows: 2,
        resultSets: [[{ found: 1 }], [{ count: 1 }]],
        outputParameters: [undefined, 9, 12]
    });

    expect(mocks.request.input).toHaveBeenCalledWith('p0', 'Ada');
    expect(mocks.request.output).toHaveBeenNthCalledWith(1, 'p1', { kind: 'Int' });
    expect(mocks.request.output).toHaveBeenNthCalledWith(
        2, 'p2', { kind: 'Decimal', precision: 8, scale: 2 }, 3
    );
    expect(mocks.request.query).toHaveBeenCalledWith(
        'EXEC [dbo].[summarize] @p0, @p1 OUTPUT, @p2 OUTPUT'
    );
});

it('rejects invalid SQL Server OUT parameter type metadata', async () => {
    const connection = new SqlServerConnection({ request: vi.fn(() => mocks.request) } as never);

    await expect(connection.execute({
        sql: 'EXEC [dbo].[summarize] @p0 OUTPUT',
        parameters: [null],
        procedureCall: {
            name: 'summarize',
            args: [{ mode: 'out', type: { type: 'decimal', precision: 39, scale: 2 } }]
        }
    })).rejects.toThrow('precision between 1 and 38');
    expect(mocks.request.query).not.toHaveBeenCalled();
});
