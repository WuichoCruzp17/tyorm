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
