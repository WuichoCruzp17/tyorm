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
