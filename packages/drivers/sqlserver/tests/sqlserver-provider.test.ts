import { Column, DataSource, Entity, PrimaryKey, column, param, eq, type SelectQuery } from '@tyorm/core';
import { beforeEach, expect, it, vi } from 'vitest';
import { sqlServerProvider } from '../src/sqlserver-provider';
import { SqlServerDriver } from '../src/driver/sqlserver-driver';
import { SqlServerSelectCompiler } from '../src/query/compiler';
import * as publicApi from '../src/index';

const mocks = vi.hoisted(() => {
    const request = {
        input: vi.fn(function (this: unknown) { return this; }),
        output: vi.fn(function (this: unknown) { return this; }),
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
    const transaction = {
        begin: vi.fn(),
        request: vi.fn(() => request),
        commit: vi.fn(),
        rollback: vi.fn()
    };
    const Transaction = vi.fn(function () { return transaction; });
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
    return { request, pool, ConnectionPool, isolation, Transaction, transaction, sqlTypes };
});

vi.mock('mssql', () => ({
    ConnectionPool: mocks.ConnectionPool,
    Transaction: mocks.Transaction,
    ISOLATION_LEVEL: mocks.isolation,
    MAX: -1,
    default: {
        ConnectionPool: mocks.ConnectionPool,
        Transaction: mocks.Transaction,
        ISOLATION_LEVEL: mocks.isolation,
        MAX: -1,
        ...mocks.sqlTypes
    }
}));

@Entity({ name: 'staff' })
class Staff {
    @PrimaryKey({ type: 'integer', name: 'staff_id', generation: 'increment' })
    id!: number;

    @Column({ type: 'string', name: 'display_name' })
    name!: string;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.connect.mockResolvedValue(mocks.pool);
    mocks.pool.close.mockResolvedValue(undefined);
    mocks.transaction.begin.mockResolvedValue(undefined);
    mocks.transaction.commit.mockResolvedValue(undefined);
    mocks.transaction.rollback.mockResolvedValue(undefined);
    mocks.request.query.mockResolvedValue({
        recordset: [{ id: 1, name: 'Ada' }],
        recordsets: [[{ id: 1, name: 'Ada' }]],
        output: {},
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
        affectedRows: 1,
        resultSets: [[{ id: 1, name: 'Ada' }]]
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

it('returns typed OUT/INOUT values and every result set from DataSource procedures', async () => {
    const dataSource = await DataSource.connect({
        type: 'sqlserver',
        database: 'tyorm_test',
        username: 'tyorm_user',
        password: 'secret',
        entities: [Staff],
        providers: { sqlserver: sqlServerProvider }
    });
    mocks.request.query.mockResolvedValueOnce({
        recordset: [{ label: 'staff' }],
        recordsets: [[{ label: 'staff' }], [{ total: 1 }]],
        output: { p1: 1, p2: 2 },
        rowsAffected: [1, 1]
    });

    await expect(dataSource.executeProcedure({
        schema: 'dbo',
        name: 'summarize_staff',
        args: [
            'Ada',
            { mode: 'out', type: { type: 'integer' } },
            { mode: 'inout', value: 1, type: { type: 'integer' } }
        ]
    })).resolves.toEqual({
        rows: [{ label: 'staff' }],
        affectedRows: 2,
        resultSets: [[{ label: 'staff' }], [{ total: 1 }]],
        outputParameters: [undefined, 1, 2]
    });

    expect(mocks.request.query).toHaveBeenCalledWith(
        'EXEC [dbo].[summarize_staff] @p0, @p1 OUTPUT, @p2 OUTPUT'
    );
    expect(mocks.request.output).toHaveBeenNthCalledWith(1, 'p1', { kind: 'Int' });
    expect(mocks.request.output).toHaveBeenNthCalledWith(2, 'p2', { kind: 'Int' }, 1);
    await dataSource.close();
});

it('executes procedure calls inside a transaction and rolls back procedure failures', async () => {
    const dataSource = await DataSource.connect({
        type: 'sqlserver',
        database: 'tyorm_test',
        username: 'tyorm_user',
        password: 'secret',
        entities: [Staff],
        providers: { sqlserver: sqlServerProvider }
    });
    const procedureError = new Error('procedure failed');
    mocks.request.query.mockRejectedValueOnce(procedureError);

    await expect(dataSource.transaction(async scope => {
        await scope.executeProcedure({
            name: 'fail_procedure',
            args: [{ mode: 'out', type: { type: 'integer' } }]
        });
    })).rejects.toMatchObject({
        errors: expect.arrayContaining([procedureError])
    });

    expect(mocks.transaction.request).toHaveBeenCalledOnce();
    expect(mocks.pool.request).not.toHaveBeenCalled();
    expect(mocks.transaction.rollback).toHaveBeenCalledOnce();
    await dataSource.close();
});

it('commits successful procedure calls in a transaction', async () => {
    const dataSource = await DataSource.connect({
        type: 'sqlserver',
        database: 'tyorm_test',
        username: 'tyorm_user',
        password: 'secret',
        entities: [Staff],
        providers: { sqlserver: sqlServerProvider }
    });

    await expect(dataSource.transaction(scope =>
        scope.executeProcedure({ name: 'refresh_staff' })
    )).resolves.toMatchObject({
        rows: [{ id: 1, name: 'Ada' }],
        resultSets: [[{ id: 1, name: 'Ada' }]]
    });

    expect(mocks.transaction.request).toHaveBeenCalledOnce();
    expect(mocks.pool.request).not.toHaveBeenCalled();
    expect(mocks.transaction.commit).toHaveBeenCalledOnce();
    await dataSource.close();
});

it('executes mutations and Repository.save through DataSource with returned columns', async () => {
    const dataSource = await DataSource.connect({
        type: 'sqlserver',
        database: 'tyorm_test',
        username: 'tyorm_user',
        password: 'secret',
        entities: [Staff],
        providers: { sqlserver: sqlServerProvider }
    });
    mocks.request.query
        .mockResolvedValueOnce({
            recordset: [{ id: 7, name: "O'Brien" }],
            rowsAffected: [1]
        })
        .mockResolvedValueOnce({
            recordset: [{ id: 7, name: 'Updated' }],
            rowsAffected: [1]
        });

    await expect(dataSource.executeMutation({
        kind: 'insert', entity: Staff, values: { name: "O'Brien" }
    })).resolves.toEqual({
        rows: [{ id: 7, name: "O'Brien" }],
        affectedRows: 1
    });
    await expect(dataSource.getRepository(Staff).save({ id: 7, name: 'Updated' }))
        .resolves.toMatchObject({ id: 7, name: 'Updated' });

    expect(mocks.request.query).toHaveBeenNthCalledWith(
        1,
        'INSERT INTO [staff] ([display_name]) OUTPUT INSERTED.[staff_id] AS [id], ' +
            'INSERTED.[display_name] AS [name] VALUES (@p0)'
    );
    expect(mocks.request.query).toHaveBeenNthCalledWith(
        2,
        'UPDATE [staff] SET [display_name] = @p0 ' +
            'OUTPUT INSERTED.[staff_id] AS [id], INSERTED.[display_name] AS [name] ' +
            'WHERE [staff_id] = @p1'
    );
    expect(mocks.request.input).toHaveBeenNthCalledWith(1, 'p0', "O'Brien");
    expect(mocks.request.input).toHaveBeenNthCalledWith(2, 'p0', 'Updated');
    expect(mocks.request.input).toHaveBeenNthCalledWith(3, 'p1', 7);

    await dataSource.close();
});
