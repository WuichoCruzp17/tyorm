import sql from 'mssql';
import { beforeEach, expect, it, vi } from 'vitest';
import { SqlServerDriver } from '../src/driver/sqlserver-driver';

const { ConnectionPool } = sql;

const mocks = vi.hoisted(() => {
    const request = { query: vi.fn() };
    const pool = {
        connect: vi.fn(),
        close: vi.fn(),
        request: vi.fn(() => request)
    };
    const ConnectionPool = vi.fn(function () { return pool; });
    const isolation = {
        READ_UNCOMMITTED: 1,
        READ_COMMITTED: 2,
        REPEATABLE_READ: 3,
        SERIALIZABLE: 4
    };
    const Transaction = vi.fn(function () { return {}; });
    return { pool, request, ConnectionPool, Transaction, isolation };
});

vi.mock('mssql', () => ({
    ConnectionPool: mocks.ConnectionPool,
    Transaction: mocks.Transaction,
    ISOLATION_LEVEL: mocks.isolation,
    default: {
        ConnectionPool: mocks.ConnectionPool,
        Transaction: mocks.Transaction,
        ISOLATION_LEVEL: mocks.isolation
    }
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.connect.mockResolvedValue(mocks.pool);
    mocks.pool.close.mockResolvedValue(undefined);
    mocks.request.query.mockResolvedValue({ recordset: [{ tyorm_ping: 1 }] });
});

const config = {
    type: 'sqlserver',
    host: 'db.example.test',
    port: 1433,
    database: 'tyorm_test',
    username: 'tyorm_user',
    password: 'secret'
} as const;

it('connects with TLS verification enabled by default and closes the pool once', async () => {
    const driver = new SqlServerDriver();
    await driver.connect(config);

    expect(ConnectionPool).toHaveBeenCalledWith(expect.objectContaining({
        server: 'db.example.test',
        port: 1433,
        database: 'tyorm_test',
        user: 'tyorm_user',
        password: 'secret',
        options: { encrypt: true, trustServerCertificate: false }
    }));
    expect(await driver.ping()).toBe(true);

    await Promise.all([driver.disconnect(), driver.disconnect()]);
    expect(mocks.pool.close).toHaveBeenCalledOnce();
    await expect(driver.acquireConnection()).rejects.toThrow('disconnected');
});

it('rejects invalid configuration before creating a pool', async () => {
    const driver = new SqlServerDriver();

    await expect(driver.connect({ ...config, type: 'postgres' })).rejects.toThrow('requires type "sqlserver"');
    await expect(driver.connect({ ...config, port: 0 })).rejects.toThrow('port must be an integer');
    await expect(driver.connect({
        ...config,
        driverOptions: { trustServerCertificate: 'true' }
    })).rejects.toThrow('must be a boolean');
    await expect(driver.connect({
        ...config,
        driverOptions: { unknownOption: true }
    })).rejects.toThrow('Unsupported SQL Server driver option');
    await expect(driver.connect({
        ...config,
        pool: { min: 4, max: 2 }
    })).rejects.toThrow('pool.min');

    expect(ConnectionPool).not.toHaveBeenCalled();
});

it('closes the failed pool and preserves the connection error', async () => {
    const cause = new Error('connection refused');
    mocks.pool.connect.mockRejectedValueOnce(cause);
    const driver = new SqlServerDriver();

    await expect(driver.connect(config)).rejects.toBe(cause);
    expect(mocks.pool.close).toHaveBeenCalledOnce();
});
