import { createPool, type Pool } from 'mysql2/promise';
import type { DatabaseDriver, DriverConfig } from '@tyorm/core';
import { MySQLConnection } from '../connection/mysql-connection';

export class MySQLDriver implements DatabaseDriver {
    readonly name = 'mysql';
    private pool: Pool | undefined;
    private closing: Promise<void> | undefined;

    async connect(config: DriverConfig): Promise<void> {
        if (this.pool || this.closing) throw new Error('MySQL driver is already connected or closing.');
        if (config.type !== this.name) throw new Error('MySQL driver requires type "mysql".');
        const pool = createPool({
            host: config.host ?? 'localhost',
            port: config.port ?? 3306,
            user: config.username ?? 'root',
            ...(config.password === undefined ? {} : { password: config.password }),
            database: config.database,
            connectionLimit: config.pool?.max ?? 10,
            idleTimeout: config.pool?.idleTimeoutMs ?? 60_000,
            supportBigNumbers: true
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
