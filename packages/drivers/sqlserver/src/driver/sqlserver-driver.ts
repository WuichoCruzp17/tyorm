import sql, { type ConnectionPool, type config as MssqlConfig } from 'mssql';
import type { DatabaseConnection, DatabaseDriver, DriverConfig } from '@tyorm/core';
import { SqlServerConnection } from '../connection/sqlserver-connection';

interface SqlServerOptions {
    readonly encrypt: boolean;
    readonly trustServerCertificate: boolean;
    readonly connectionTimeoutMs: number;
    readonly requestTimeoutMs: number;
    readonly appName?: string;
}

export class SqlServerDriver implements DatabaseDriver {
    readonly name = 'sqlserver';
    private pool: ConnectionPool | undefined;
    private connecting = false;
    private closing: Promise<void> | undefined;

    async connect(config: DriverConfig): Promise<void> {
        if (this.pool || this.connecting || this.closing) {
            throw new Error('SQL Server driver is already connected, connecting, or closing.');
        }
        if (config.type !== this.name) {
            throw new Error('SQL Server driver requires type "sqlserver".');
        }
        if (!config.database.trim()) throw new TypeError('SQL Server database is required.');
        if (!config.username?.trim()) throw new TypeError('SQL Server username is required.');
        if (config.password === undefined) throw new TypeError('SQL Server password is required.');

        const host = config.host ?? 'localhost';
        const port = config.port ?? 1433;
        if (!host.trim()) throw new TypeError('SQL Server host must not be empty.');
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new RangeError('SQL Server port must be an integer between 1 and 65535.');
        }
        validatePoolConfig(config);
        const options = readOptions(config.driverOptions);

        const pool = new sql.ConnectionPool(createConfig(config, host, port, options));
        this.connecting = true;
        try {
            await pool.connect();
            this.pool = pool;
        } catch (cause) {
            try {
                await pool.close();
            } catch (closeError) {
                throw new AggregateError([cause, closeError], 'SQL Server connection and cleanup failed.');
            }
            throw cause;
        } finally {
            this.connecting = false;
        }
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        if (!this.pool || this.closing) {
            throw new Error('SQL Server driver is disconnected or closing.');
        }
        return new SqlServerConnection(this.pool);
    }

    async ping(): Promise<boolean> {
        if (!this.pool || this.closing) return false;
        try {
            await this.pool.request().query('SELECT 1 AS [tyorm_ping]');
            return true;
        } catch {
            return false;
        }
    }

    disconnect(): Promise<void> {
        if (this.closing) return this.closing;
        if (this.connecting) {
            return Promise.reject(new Error('Cannot disconnect SQL Server driver while connecting.'));
        }
        const pool = this.pool;
        if (!pool) return Promise.resolve();

        const closing = pool.close().finally(() => {
            if (this.pool === pool) this.pool = undefined;
            this.closing = undefined;
        });
        this.closing = closing;
        return closing;
    }
}

function validatePoolConfig(config: DriverConfig): void {
    const max = config.pool?.max ?? 10;
    const min = config.pool?.min ?? 0;
    const idleTimeoutMs = config.pool?.idleTimeoutMs;
    if (!Number.isSafeInteger(max) || max < 1) {
        throw new RangeError('SQL Server pool.max must be a positive integer.');
    }
    if (!Number.isSafeInteger(min) || min < 0 || min > max) {
        throw new RangeError('SQL Server pool.min must be a non-negative integer no greater than pool.max.');
    }
    if (idleTimeoutMs !== undefined && !isPositiveInteger(idleTimeoutMs)) {
        throw new RangeError('SQL Server pool.idleTimeoutMs must be a positive integer.');
    }
}

function createConfig(
    config: DriverConfig,
    host: string,
    port: number,
    options: SqlServerOptions
): MssqlConfig {
    return {
        server: host,
        port,
        user: config.username,
        password: config.password,
        database: config.database,
        connectionTimeout: options.connectionTimeoutMs,
        requestTimeout: options.requestTimeoutMs,
        pool: {
            max: config.pool?.max ?? 10,
            min: config.pool?.min ?? 0,
            ...(config.pool?.idleTimeoutMs === undefined
                ? {}
                : { idleTimeoutMillis: config.pool.idleTimeoutMs })
        },
        options: {
            encrypt: options.encrypt,
            trustServerCertificate: options.trustServerCertificate,
            ...(options.appName === undefined ? {} : { appName: options.appName })
        }
    };
}

function readOptions(value: DriverConfig['driverOptions']): SqlServerOptions {
    if (value === undefined) {
        return {
            encrypt: true,
            trustServerCertificate: false,
            connectionTimeoutMs: 15_000,
            requestTimeoutMs: 15_000
        };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('SQL Server driverOptions must be an object.');
    }

    const supported = new Set([
        'encrypt',
        'trustServerCertificate',
        'connectionTimeoutMs',
        'requestTimeoutMs',
        'appName'
    ]);
    for (const key of Object.keys(value)) {
        if (!supported.has(key)) throw new TypeError(`Unsupported SQL Server driver option "${key}".`);
    }

    const options = value;
    const encrypt = options.encrypt ?? true;
    const trustServerCertificate = options.trustServerCertificate ?? false;
    const connectionTimeoutMs = options.connectionTimeoutMs ?? 15_000;
    const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    const appName = options.appName;

    if (typeof encrypt !== 'boolean') throw new TypeError('SQL Server encrypt must be a boolean.');
    if (typeof trustServerCertificate !== 'boolean') {
        throw new TypeError('SQL Server trustServerCertificate must be a boolean.');
    }
    if (!isPositiveInteger(connectionTimeoutMs) || !isPositiveInteger(requestTimeoutMs)) {
        throw new TypeError('SQL Server timeouts must be positive integers.');
    }
    if (appName !== undefined && (typeof appName !== 'string' || appName.length === 0)) {
        throw new TypeError('SQL Server appName must be a non-empty string.');
    }

    return {
        encrypt,
        trustServerCertificate,
        connectionTimeoutMs,
        requestTimeoutMs,
        ...(appName === undefined ? {} : { appName })
    };
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
