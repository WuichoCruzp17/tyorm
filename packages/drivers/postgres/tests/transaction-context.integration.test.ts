
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { TransactionManager } from '@tyorm/core';

import { PostgreSQLDriver } from
  '../src/driver/postgresql-driver';

// Ajusta la ruta del import anterior si tu clase
// PostgreSQLDriver está en otra carpeta.

describe('TransactionContext - PostgreSQL integration', () => {
  let driver: PostgreSQLDriver;
  let manager: TransactionManager;

  beforeAll(async () => {
    driver = new PostgreSQLDriver();


    await driver.connect({
      type: 'postgres',
      host: process.env.PGHOST!,
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE!,
      username: process.env.PGUSER!,
      password: process.env.PGPASSWORD!,
      pool: { min: 1, max: 1 }
    });


    manager = new TransactionManager(driver);
    const connection = await driver.acquireConnection();
    try {
      await connection.execute({
        sql: 'CREATE TEMP TABLE pending_writes (id INTEGER PRIMARY KEY)'
      });
    } finally {
      await connection.release();
    }
  });

  afterAll(async () => {
    if (driver) {
      await driver.disconnect();
    }
  });

  it('should rollback queued queries after SQL failure', async () => {
    let caught: unknown;

    try {
      await manager.withContext(async (context) => {
        const results = await Promise.allSettled([
          context.execute({
            sql: 'SELECT 1 / 0 AS value'
          }),
          context.execute({
            sql: 'SELECT 42 AS value'
          })
        ]);

        expect(results[0].status).toBe('rejected');
        expect(results[1].status).toBe('rejected');

        if (
          results[0].status === 'rejected' &&
          results[1].status === 'rejected'
        ) {
          expect(results[0].reason.code).toBe('22012');
          expect(results[1].reason.code).toBe('25P02');
        }
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);

    const aggregate = caught as AggregateError;

    expect(aggregate.errors).toHaveLength(2);

    // El contexto debe permitir que el manager haga
    // ROLLBACK antes de iniciar otra transacción.
    const result = await manager.withContext(async (context) => {
      return context.execute<{ value: number }>({
        sql: 'SELECT 42 AS value'
      });
    });

    expect(result.rows[0]?.value).toBe(42);
  });

  it('commits writes submitted without awaiting them in the callback', async () => {
    const ids = [101, 102];
    await expect(manager.withContext(async context => {
      for (const id of ids) {
        void context.execute({
          sql: 'INSERT INTO pending_writes (id) VALUES ($1)',
          parameters: [id]
        });
      }
      return 'queued';
    })).resolves.toBe('queued');

    const result = await manager.withContext(context =>
      context.execute<{ id: number }>({
        sql: 'SELECT id FROM pending_writes WHERE id IN ($1, $2) ORDER BY id',
        parameters: ids
      })
    );
    expect(result.rows).toEqual(ids.map(id => ({ id })));
  });

  it('drains a pending SQL failure, rolls back earlier writes and reuses the backend', async () => {
    const id = 201;
    const backend = await manager.withContext(async context => {
      const { rows } = await context.execute<{ pid: number }>({
        sql: 'SELECT pg_backend_pid() AS pid'
      });
      return rows[0]?.pid;
    });
    expect(backend).toEqual(expect.any(Number));

    const insert = { sql: 'INSERT INTO pending_writes (id) VALUES ($1)', parameters: [id] };
    await expect(manager.withContext(async context => {
      void context.execute(insert);
      void context.execute(insert);
      void context.execute({ sql: 'SELECT 1' });
    })).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [
        expect.objectContaining({ code: '23505' }),
        expect.objectContaining({ code: '25P02' })
      ]
    });

    const recovered = await manager.withContext(context =>
      context.execute<{ pid: number; persisted: boolean }>({
        sql: 'SELECT pg_backend_pid() AS pid, EXISTS (SELECT 1 FROM pending_writes WHERE id = $1) AS persisted',
        parameters: [id]
      })
    );
    expect(recovered.rows).toEqual([{ pid: backend, persisted: false }]);
  });
});
