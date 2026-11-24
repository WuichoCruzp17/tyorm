import type { PoolConnection } from 'mysql2/promise';
import { expect, it, vi } from 'vitest';
import { MySQLConnection } from '../src/connection/mysql-connection';

it('preserves a statement failure and rolls back before releasing the session', async () => {
    const events: string[] = [];
    const failure = new Error('SQL failed');
    const client = {
        query: vi.fn(async (sql: string) => { events.push(sql); }),
        execute: vi.fn(async () => { events.push('execute'); throw failure; }),
        rollback: vi.fn(async () => { events.push('rollback'); }),
        release: vi.fn(() => { events.push('release'); })
    };
    const connection = new MySQLConnection(client as unknown as PoolConnection);
    const begin = connection.beginTransaction({ isolationLevel: 'SERIALIZABLE', readOnly: true });
    const result = connection.execute({ sql: 'SELECT ?', parameters: [1] });
    const release = connection.release();
    await expect(begin).resolves.toBeUndefined();
    await expect(result).rejects.toBe(failure);
    await release;
    expect(events).toEqual([
        'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'START TRANSACTION READ ONLY',
        'execute', 'rollback', 'release'
    ]);
    await expect(connection.execute({ sql: 'SELECT 1' })).rejects.toThrow('unavailable');
});

it('calls a qualified procedure with bound inputs and preserves each result set', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
        [[{ total: 2 }], [], [{ label: 'second' }], { affectedRows: 1 }]
    ]).mockResolvedValueOnce([{ affectedRows: 3 }]);
    const client = { execute };
    const connection = new MySQLConnection(client as unknown as PoolConnection);

    await expect(connection.callProcedure('read`values', ["O'Reilly", 2n, null], 'app.db'))
        .resolves.toEqual({ resultSets: [[{ total: 2 }], [], [{ label: 'second' }]], affectedRows: 1 });
    expect(execute).toHaveBeenNthCalledWith(1, 'CALL `app.db`.`read``values`(?, ?, ?)', ["O'Reilly", '2', null]);

    await expect(connection.callProcedure('refresh')).resolves.toEqual({ resultSets: [], affectedRows: 3 });
    expect(execute).toHaveBeenNthCalledWith(2, 'CALL `refresh`()', []);
});

it('binds IN values and retrieves OUT and INOUT values by argument position', async () => {
    const query = vi.fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[{ output_1: 'returned', output_2: 3 }], []])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
    const execute = vi.fn().mockResolvedValueOnce([
        [[{ ok: 1 }], { affectedRows: 0 }]
    ]);
    const connection = new MySQLConnection({ query, execute } as unknown as PoolConnection);

    await expect(connection.callProcedure('write_values', [
        { mode: 'in', value: "O'Reilly" },
        { mode: 'out' },
        { mode: 'inout', value: 2 }
    ])).resolves.toEqual({
        resultSets: [[{ ok: 1 }]],
        affectedRows: 0,
        outputParameters: [undefined, 'returned', 3]
    });

    expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^SET @tyorm_[a-f0-9]+_1 = \?, @tyorm_[a-f0-9]+_2 = \?$/),
        [null, 2]
    );
    expect(execute).toHaveBeenCalledWith(
        expect.stringMatching(/^CALL `write_values`\(\?, @tyorm_[a-f0-9]+_1, @tyorm_[a-f0-9]+_2\)$/),
        ["O'Reilly"]
    );
    expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(/^SELECT @tyorm_[a-f0-9]+_1 AS `output_1`, @tyorm_[a-f0-9]+_2 AS `output_2`$/)
    );
    expect(query).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(/^SET @tyorm_[a-f0-9]+_1 = NULL, @tyorm_[a-f0-9]+_2 = NULL$/)
    );
});

it('clears session variables when a procedure call fails', async () => {
    const failure = new Error('procedure failed');
    const query = vi.fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
    const execute = vi.fn().mockRejectedValueOnce(failure);
    const connection = new MySQLConnection({ query, execute } as unknown as PoolConnection);

    await expect(connection.callProcedure('write_value', [{ mode: 'out' }])).rejects.toBe(failure);
    expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^SET @tyorm_[a-f0-9]+_0 = \?$/),
        [null]
    );
    expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(/^SET @tyorm_[a-f0-9]+_0 = NULL$/)
    );
});

it('rejects unsupported INOUT values and clears any generated session variables', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ affectedRows: 0 }]);
    const execute = vi.fn();
    const connection = new MySQLConnection({ query, execute } as unknown as PoolConnection);

    await expect(connection.callProcedure('write_value', [
        { mode: 'out' },
        { mode: 'inout', value: { unsupported: true } }
    ])).rejects.toThrow('Unsupported MySQL parameter value');

    expect(execute).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/^SET @tyorm_[a-f0-9]+_0 = NULL, @tyorm_[a-f0-9]+_1 = NULL$/)
    );
});

it('uses the text protocol for procedure DDL', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ affectedRows: 0 }]);
    const execute = vi.fn();
    const connection = new MySQLConnection({
        query,
        execute
    } as unknown as PoolConnection);
    const sql = 'CREATE PROCEDURE refresh() BEGIN SELECT 1; END';

    await expect(connection.execute({ sql })).resolves.toEqual({ rows: [], affectedRows: 0 });
    expect(query).toHaveBeenCalledWith(sql);
    expect(execute).not.toHaveBeenCalled();
});

it('queues a procedure on the active transaction and preserves its failure', async () => {
    const failure = new Error('procedure failed');
    const events: string[] = [];
    const client = {
        query: vi.fn(async () => { events.push('begin'); }),
        execute: vi.fn(async () => { events.push('call'); throw failure; }),
        rollback: vi.fn(async () => { events.push('rollback'); }),
        release: vi.fn(() => { events.push('release'); })
    };
    const connection = new MySQLConnection(client as unknown as PoolConnection);

    const begin = connection.beginTransaction();
    const call = connection.callProcedure('refresh');
    const release = connection.release();
    await expect(call).rejects.toBe(failure);
    await begin;
    await release;
    expect(events).toEqual(['begin', 'call', 'rollback', 'release']);
    await expect(connection.callProcedure('refresh')).rejects.toThrow('unavailable');
});
