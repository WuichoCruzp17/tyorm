import { Column, DataSource, Entity, PrimaryKey, column, param, eq, type SelectQuery } from '@tyorm/core';
import { beforeEach, expect, it, vi } from 'vitest';
import { sqlServerProvider } from '../src/sqlserver-provider';
import { SqlServerDriver } from '../src/driver/sqlserver-driver';
import { SqlServerSelectCompiler } from '../src/query/compiler';
import * as publicApi from '../src/index';

const mocks = vi.hoisted(() => {
    const request = {
        input: vi.fn(function (this: unknown) { return this; }),
        query: vi.fn()
    };
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
    return { request, pool, ConnectionPool, isolation, Transaction };
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

@Entity({ name: 'staff' })
class Staff {
    @PrimaryKey({ type: 'integer', name: 'staff_id' })
    id!: number;

    @Column({ type: 'string', name: 'display_name' })
    name!: string;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.connect.mockResolvedValue(mocks.pool);
    mocks.pool.close.mockResolvedValue(undefined);
    mocks.request.query.mockResolvedValue({
        recordset: [{ id: 1, name: 'Ada' }],
        rowsAffected: [1]
    });
});

it('provides the SQL Server driver and compiler through Core contracts', () => {
    const provider = sqlServerProvider();
    expect(provider.driver).toBeInstanceOf(SqlServerDriver);
    expect(provider.compiler).toBeInstanceOf(SqlServerSelectCompiler);
    expect(publicApi).toHaveProperty('sqlServerProvider');
    expect(publicApi).not.toHaveProperty('SqlServerConnection');
});

it('executes a SELECT and an IN stored procedure through DataSource', async () => {
    const dataSource = await DataSource.connect({
        type: 'sqlserver',
        database: 'tyorm_test',
        username: 'tyorm_user',
        password: 'secret',
        entities: [Staff],
        providers: { sqlserver: sqlServerProvider }
    });
    const query: SelectQuery = {
        kind: 'select',
        from: { entity: Staff, alias: 's' },
        selections: [{ expression: column('s', 'name') }],
        where: eq(column('s', 'name'), param('name')),
        joins: [],
        orderBy: [],
        distinct: false
    };

    await expect(dataSource.execute(query, { name: 'Ada' })).resolves.toEqual({
        rows: [{ id: 1, name: 'Ada' }],
        affectedRows: 1
    });
    await expect(dataSource.executeProcedure({
        schema: 'dbo',
        name: 'find_staff',
        args: ['Ada']
    })).resolves.toEqual({
        rows: [{ id: 1, name: 'Ada' }],
        affectedRows: 1
    });

    expect(mocks.request.query).toHaveBeenNthCalledWith(
        1,
        'SELECT [s].[display_name] FROM [staff] AS [s] WHERE [s].[display_name] = @p0'
    );
    expect(mocks.request.query).toHaveBeenNthCalledWith(
        2,
        'EXEC [dbo].[find_staff] @p0'
    );
    expect(mocks.request.input).toHaveBeenNthCalledWith(1, 'p0', 'Ada');
    expect(mocks.request.input).toHaveBeenNthCalledWith(2, 'p0', 'Ada');

    await dataSource.close();
    expect(mocks.pool.close).toHaveBeenCalledOnce();
});
