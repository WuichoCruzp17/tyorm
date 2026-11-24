import { beforeEach, expect, it, vi } from 'vitest';
import { SqlServerConnection } from '../src/connection/sqlserver-connection';

const mocks = vi.hoisted(() => {
    const request = {
        input: vi.fn(function (this: unknown) { return this; }),
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
    return { request, transaction, Transaction, isolation };
});

vi.mock('mssql', () => ({
    Transaction: mocks.Transaction,
    ISOLATION_LEVEL: mocks.isolation,
    default: {
        Transaction: mocks.Transaction,
        ISOLATION_LEVEL: mocks.isolation
    }
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.query.mockResolvedValue({
        recordset: [{ id: 7 }],
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
