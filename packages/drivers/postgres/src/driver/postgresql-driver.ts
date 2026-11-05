import type {
  DatabaseDriver,
  DatabaseConnection,
  DriverConfig
} from '@tyorm/core';

import { PostgreSQLPool } from '../connection/postgresql-pool';
import { PostgreSQLConnection } from '../connection/postgresql-connection';

import type { PoolConfig as PgPoolConfig } from 'pg';

export class PostgreSQLDriver implements DatabaseDriver {
  readonly name = 'postgres';

  private pool: PostgreSQLPool | undefined;

  async connect(config: DriverConfig): Promise<void> {
    if (this.pool) {
      throw new Error('PostgreSQL driver is already connected.');
    }

    if (
      config.type.toLowerCase() !== 'postgres' &&
      config.type.toLowerCase() !== 'postgresql'
    ) {
      throw new Error(
        `Invalid driver type "${config.type}". Expected "postgres".`
      );
    }

    const pgConfig = this.buildPoolConfig(config);
    const pool = new PostgreSQLPool(pgConfig);

    try {
      await pool.verify();
      this.pool = pool;
    } catch (error) {
      await pool.close().catch(() => undefined);
      throw error;
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.pool) {
      throw new Error(
        'PostgreSQL driver is not connected. Call connect() first.'
      );
    }

    const client = await this.pool.acquire();

    return new PostgreSQLConnection(client);
  }

  async ping(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    return this.pool.ping();
  }

  async disconnect(): Promise<void> {
    const pool = this.pool;

    if (!pool) {
      return;
    }

    this.pool = undefined;

    await pool.close();
  }

  private buildPoolConfig(config: DriverConfig): PgPoolConfig {
    const poolConfig = config.pool;

    const pgConfig = {
      ...(config.driverOptions ?? {}),

      database: config.database,

      ...(config.host !== undefined
        ? { host: config.host }
        : {}),

      ...(config.port !== undefined
        ? { port: config.port }
        : {}),

      ...(config.username !== undefined
        ? { user: config.username }
        : {}),

      ...(config.password !== undefined
        ? { password: config.password }
        : {}),

      ...(poolConfig?.min !== undefined
        ? { min: poolConfig.min }
        : {}),

      ...(poolConfig?.max !== undefined
        ? { max: poolConfig.max }
        : {}),

      ...(poolConfig?.acquireTimeoutMs !== undefined
        ? { connectionTimeoutMillis: poolConfig.acquireTimeoutMs }
        : {}),

      ...(poolConfig?.idleTimeoutMs !== undefined
        ? { idleTimeoutMillis: poolConfig.idleTimeoutMs }
        : {})
    } as PgPoolConfig;

    return pgConfig;
  }
}
