
import {
  beforeAll,
  afterAll,
  describe,
  expect,
  it
} from 'vitest';

import { randomUUID } from 'node:crypto';

import { TransactionManager } from '@tyorm/core';
import { PostgreSQLDriver } from '../src/driver/postgresql-driver';

const TABLE = 'tyorm_test.transaction_manager_test';

describe('TransactionManager PostgreSQL Integration', () => {
  const driver = new PostgreSQLDriver();
  const manager = new TransactionManager(driver);

  const createdIds = new Set<string>();
  let connected = false;

  beforeAll(async () => {
    const password = process.env.PGPASSWORD;

    if (!password) {
      throw new Error('PGPASSWORD is not configured');
    }

    await driver.connect({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'tyorm_test',
      username: process.env.PGUSER ?? 'postgres',
      password,
      pool: {
        min: 1,
        max: 5
      }
    });

    connected = true;

    const connection = await driver.acquireConnection();

    try {
      await connection.execute({
        sql: 'CREATE SCHEMA IF NOT EXISTS tyorm_test'
      });

      await connection.execute({
        sql: `
          CREATE TABLE IF NOT EXISTS ${TABLE} (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL
          )
        `
      });
    } finally {
      await connection.release();
    }
  });

  afterAll(async () => {
    if (!connected) return;

    try {
      if (createdIds.size > 0) {
        const connection = await driver.acquireConnection();

        try {
          await connection.execute({
            sql: `DELETE FROM ${TABLE} WHERE id = ANY($1::uuid[])`,
            parameters: [[...createdIds]]
          });
        } finally {
          await connection.release();
        }
      }
    } finally {
      await driver.disconnect();
    }
  });

  it('should commit and return callback result', async () => {
    const id = randomUUID();
    createdIds.add(id);

    const result = await manager.transaction(async (connection) => {
      await connection.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        parameters: [id, 'Committed']
      });

      return id;
    });

    expect(result).toBe(id);

    const verifier = await driver.acquireConnection();

    try {
      const rows = await verifier.execute<{ name: string }>({
        sql: `SELECT name FROM ${TABLE} WHERE id = $1`,
        parameters: [id]
      });

      expect(rows.rows).toEqual([{ name: 'Committed' }]);
    } finally {
      await verifier.release();
    }
  });

  it('should rollback when callback throws', async () => {
    const id = randomUUID();
    createdIds.add(id);

    await expect(
      manager.transaction(async (connection) => {
        await connection.execute({
          sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
          parameters: [id, 'Rollback']
        });

        throw new Error('Business operation failed');
      })
    ).rejects.toThrow('Business operation failed');

    const verifier = await driver.acquireConnection();

    try {
      const result = await verifier.execute({
        sql: `SELECT id FROM ${TABLE} WHERE id = $1`,
        parameters: [id]
      });

      expect(result.rows).toHaveLength(0);
    } finally {
      await verifier.release();
    }
  });

  it('should execute multiple operations atomically', async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();

    createdIds.add(firstId);
    createdIds.add(secondId);

    await manager.transaction(async (connection) => {
      await connection.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        parameters: [firstId, 'First']
      });

      await connection.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        parameters: [secondId, 'Second']
      });
    });

    const verifier = await driver.acquireConnection();

    try {
      const result = await verifier.execute({
        sql: `
          SELECT id FROM ${TABLE}
          WHERE id = ANY($1::uuid[])
        `,
        parameters: [[firstId, secondId]]
      });

      expect(result.rows).toHaveLength(2);
    } finally {
      await verifier.release();
    }
  });

  it('should allow a new transaction after a failed one', async () => {
    const failedId = randomUUID();
    const successId = randomUUID();

    createdIds.add(failedId);
    createdIds.add(successId);

    await expect(
      manager.transaction(async (connection) => {
        await connection.execute({
          sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
          parameters: [failedId, 'Failed']
        });

        throw new Error('Expected failure');
      })
    ).rejects.toThrow('Expected failure');

    await manager.transaction(async (connection) => {
      await connection.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        parameters: [successId, 'Success']
      });
    });

    const verifier = await driver.acquireConnection();

    try {
      const result = await verifier.execute<{ id: string }>({
        sql: `
          SELECT id FROM ${TABLE}
          WHERE id = ANY($1::uuid[])
        `,
        parameters: [[failedId, successId]]
      });

      expect(result.rows.map(row => row.id)).toEqual([successId]);
    } finally {
      await verifier.release();
    }
  });

  it('should release connection after transaction completes', async () => {
    const id = randomUUID();
    createdIds.add(id);

    let transactionConnection:
      Awaited<ReturnType<typeof driver.acquireConnection>> | undefined;

    await manager.transaction(async (connection) => {
      transactionConnection = connection;

      await connection.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        parameters: [id, 'Released']
      });
    });

    expect(transactionConnection).toBeDefined();
    expect(transactionConnection!.isReleased).toBe(true);

    const nextConnection = await driver.acquireConnection();

    try {
      const result = await nextConnection.execute<{ value: number }>({
        sql: 'SELECT 1 AS value'
      });

      expect(result.rows[0]?.value).toBe(1);
    } finally {
      await nextConnection.release();
    }
  });
});
