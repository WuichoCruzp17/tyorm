import { isIP } from 'node:net';
import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';
import type { DatabaseDriver, DriverConfig } from '@tyorm/core';
import { MySQLConnection } from '../connection/mysql-connection';

type MySQLSslOptions = Exclude<NonNullable<PoolOptions['ssl']>, string>;

export class MySQLDriver implements DatabaseDriver {
    readonly name = 'mysql';
    private pool: Pool | undefined;
    private closing: Promise<void> | undefined;

    async connect(config: DriverConfig): Promise<void> {
        if (this.pool || this.closing) throw new Error('MySQL driver is already connected or closing.');
        if (config.type !== this.name) throw new Error('MySQL driver requires type "mysql".');
        const ssl = verifiedSslOptions(config.driverOptions?.ssl);
        const host = config.host ?? 'localhost';
        if (ssl && isIP(host)) {
            throw new Error('MySQL TLS requires a DNS hostname to verify the server identity.');
        }

        const pool = createPool({
            host,
            port: config.port ?? 3306,
            user: config.username ?? 'root',
            ...(config.password === undefined ? {} : { password: config.password }),
            database: config.database,
            connectionLimit: config.pool?.max ?? 10,
            idleTimeout: config.pool?.idleTimeoutMs ?? 60_000,
            supportBigNumbers: true,
            ...(ssl === undefined ? {} : { ssl })
        });
        this.pool = pool;
        const connection = await pool.getConnection();
        try {
            await connection.ping();
        } finally {
            connection.release();
        }
    }

    async acquireConnection(): Promise<MySQLConnection> {
        if (!this.pool || this.closing) throw new Error('MySQL driver is disconnected or closing.');
        return new MySQLConnection(await this.pool.getConnection());
    }

    async ping(): Promise<boolean> {
        if (!this.pool || this.closing) return false;
        try {
            const connection = await this.acquireConnection();
            try {
                await connection.execute({ sql: 'SELECT 1' });
                return true;
            } finally {
                await connection.release();
            }
        } catch {
            return false;
        }
    }

    disconnect(): Promise<void> {
        if (!this.pool) return Promise.resolve();
        this.closing ??= this.pool.end().finally(() => {
            this.pool = undefined;
            this.closing = undefined;
        });
        return this.closing;
    }
}

function verifiedSslOptions(value: unknown): MySQLSslOptions | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('MySQL driverOptions.ssl must be an SSL options object.');
    }

    return { ...value, rejectUnauthorized: true, verifyIdentity: true };
}
