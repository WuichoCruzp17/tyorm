import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { SQLiteConnection } from '../src/connection/sqlite-connection';

it('commits on the same connection and releases the lease once', async () => {
    const database = new DatabaseSync(':memory:');
    const unlock = vi.fn();
    const markRollbackFailed = vi.fn();
    const connection = new SQLiteConnection(database, unlock, markRollbackFailed);

    try {
        await connection.execute({ sql: 'CREATE TABLE records (value INTEGER)' });
        await connection.beginTransaction({ isolationLevel: 'SERIALIZABLE' });
        await connection.execute({ sql: 'INSERT INTO records VALUES (?)', parameters: [5] });
        await connection.commit();
        await connection.release();
        await connection.release();

        expect(database.prepare('SELECT value FROM records').get()).toEqual({ value: 5 });
        expect(connection.isReleased).toBe(true);
        expect(unlock).toHaveBeenCalledOnce();
        expect(markRollbackFailed).not.toHaveBeenCalled();
        await expect(connection.beginTransaction()).rejects.toThrow('released');
    } finally {
        database.close();
    }
});
