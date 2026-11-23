import { expect, it } from 'vitest';
import { SQLiteDriver } from '../src/driver/sqlite-driver';

it('serializes leases and rolls back on release', async () => {
    const driver = new SQLiteDriver();
    await driver.connect({ type: 'sqlite', database: ':memory:' });
    try {
        const lease = await driver.acquireConnection();
        await lease.execute({ sql: 'CREATE TABLE records (value INTEGER)' });
        await lease.beginTransaction();
        await lease.execute({ sql: 'INSERT INTO records VALUES (?)', parameters: [9007199254740993n] });
        expect((await lease.execute({ sql: 'SELECT value FROM records' })).rows[0]?.value)
            .toBe(9007199254740993n);

        let acquired = false;
        const pending = driver.acquireConnection().then(connection => {
            acquired = true;
            return connection;
        });
        await Promise.resolve();
        expect(acquired).toBe(false);
        await lease.release();
        const next = await pending;
        try {
            expect((await next.execute({ sql: 'SELECT value FROM records' })).rows).toEqual([]);
            await expect(lease.execute({ sql: 'SELECT 1' })).rejects.toThrow('released');
        } finally {
            await next.release();
        }
        expect(await driver.ping()).toBe(true);
    } finally {
        await driver.disconnect();
    }
    expect(await driver.ping()).toBe(false);
});
