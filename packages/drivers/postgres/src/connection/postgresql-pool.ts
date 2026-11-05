import { Pool } from 'pg';
import type { PoolConfig as PgPoolConfig } from 'pg';

export class PostgreSQLPool {
  private readonly pool: Pool;

  constructor(config: PgPoolConfig) {
    this.pool = new Pool(config);
  }

  async acquire() {
    return this.pool.connect();
  }

  async verify(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async ping(): Promise<boolean> {
    try {
      await this.verify();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
