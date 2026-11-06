
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
  user: process.env.PGUSER!,
  password: process.env.PGPASSWORD!
});


    manager = new TransactionManager(driver);
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
});
