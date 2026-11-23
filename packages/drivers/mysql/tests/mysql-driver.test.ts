import { createPool } from 'mysql2/promise';
import { expect, it, vi } from 'vitest';
import { MySQLDriver } from '../src/driver/mysql-driver';

vi.mock('mysql2/promise', () => ({ createPool: vi.fn() }));

it('checks the initial lease and closes the pool once', async () => {
    const client = { ping: vi.fn(), release: vi.fn() };
    const pool = { getConnection: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(createPool).mockReturnValue(pool as unknown as ReturnType<typeof createPool>);
    const driver = new MySQLDriver();
    await driver.connect({ type: 'mysql', database: 'fixture', pool: { max: 2 } });
    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({ database: 'fixture', connectionLimit: 2 }));
    expect(client.ping).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledOnce();
    await Promise.all([driver.disconnect(), driver.disconnect()]);
    expect(pool.end).toHaveBeenCalledOnce();
    await expect(driver.acquireConnection()).rejects.toThrow('disconnected');
});
