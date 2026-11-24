import { createPool } from 'mysql2/promise';
import { expect, it, vi } from 'vitest';
import { MySQLDriver } from '../src/driver/mysql-driver';

vi.mock('mysql2/promise', () => ({ createPool: vi.fn() }));

it('checks the initial lease and closes the pool once', async () => {
    vi.mocked(createPool).mockReset();
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

it('enables MySQL TLS with certificate and hostname verification', async () => {
    vi.mocked(createPool).mockReset();
    const client = { ping: vi.fn(), release: vi.fn() };
    const pool = { getConnection: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(createPool).mockReturnValue(pool as unknown as ReturnType<typeof createPool>);
    const driver = new MySQLDriver();

    await driver.connect({
        type: 'mysql',
        host: 'db.example.test',
        database: 'fixture',
        driverOptions: {
            ssl: { ca: 'trusted-ca', rejectUnauthorized: false, verifyIdentity: false }
        }
    });

    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({
        ssl: { ca: 'trusted-ca', rejectUnauthorized: true, verifyIdentity: true }
    }));
    await driver.disconnect();
});

it('rejects invalid TLS settings and IP hosts before creating a pool', async () => {
    vi.mocked(createPool).mockReset();
    const driver = new MySQLDriver();

    await expect(driver.connect({
        type: 'mysql', database: 'fixture', driverOptions: { ssl: 'unverified-profile' }
    })).rejects.toThrow('must be an SSL options object');
    await expect(driver.connect({
        type: 'mysql',
        host: '192.0.2.10',
        database: 'fixture',
        driverOptions: { ssl: { ca: 'trusted-ca' } }
    })).rejects.toThrow('requires a DNS hostname');
    expect(createPool).not.toHaveBeenCalled();
});
