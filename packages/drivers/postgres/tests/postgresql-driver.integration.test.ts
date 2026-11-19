
import {
    beforeAll,
    afterAll,
    describe,
    expect,
    it
} from 'vitest';

import { PostgreSQLDriver, PostgresSelectCompiler } from '../src/index';
import { createLeftJoinFixture } from './left-join.fixture';
import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@tyorm/core';


describe('PostgreSQLDriver Integration', () => {
    const driver = new PostgreSQLDriver();
    const TEST_TABLE = 'tyorm_test.transaction_test';
    const createdIds = new Set<string>();
    const id = randomUUID();
    createdIds.add(id);
    beforeAll(async () => {
        await driver.connect({
            type: 'postgres',
            host: process.env.PGHOST ?? 'localhost',
            port: Number(process.env.PGPORT ?? 5432),
            database: process.env.PGDATABASE ?? 'tyorm_test',
            username: process.env.PGUSER ?? 'postgres',
            password: process.env.PGPASSWORD,
            pool: {
                min: 1,
                max: 5
            }
        });

        const connection = await driver.acquireConnection();

        try {
            await connection.execute({
                sql: 'CREATE SCHEMA IF NOT EXISTS tyorm_test'
            });

            await connection.execute({
                sql: `
        CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
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
        try {
            if (createdIds.size > 0) {
                const connection = await driver.acquireConnection();

                try {
                    await connection.execute({
                        sql: `DELETE FROM ${TEST_TABLE} WHERE id = ANY($1::uuid[])`,
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

    async function createTempTable(
        connection: DatabaseConnection
    ): Promise<void> {
        await connection.execute({
            sql: `
      CREATE TEMP TABLE IF NOT EXISTS tyorm_integration_test (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      ) ON COMMIT PRESERVE ROWS
    `
        });

        await connection.execute({
            sql: 'TRUNCATE TABLE tyorm_integration_test RESTART IDENTITY'
        });
    }

    it('should execute parameterized queries', async () => {
        const connection = await driver.acquireConnection();

        try {
            const result = await connection.execute<{
                message: string;
                number: number;
            }>({
                sql: 'SELECT $1::text AS message, $2::int AS number',
                parameters: ['TyORM', 100]
            });

            expect(result.rows[0]).toEqual({
                message: 'TyORM',
                number: 100
            });
        } finally {
            await connection.release();
        }
    });

    it('should commit a transaction', async () => {
        const connection = await driver.acquireConnection();

        try {
            await createTempTable(connection);

            await connection.beginTransaction();

            await connection.execute({
                sql: `
          INSERT INTO tyorm_integration_test (name)
          VALUES ($1)
        `,
                parameters: ['Committed']
            });

            await connection.commit();

            const result = await connection.execute<{
                name: string;
            }>({
                sql: `
          SELECT name FROM tyorm_integration_test
          WHERE name = $1
        `,
                parameters: ['Committed']
            });

            expect(result.rows).toHaveLength(1);
        } finally {
            await connection.release();
        }
    });

    it('should rollback a transaction', async () => {
        const connection = await driver.acquireConnection();

        try {
            await createTempTable(connection);

            await connection.beginTransaction();

            await connection.execute({
                sql: `
          INSERT INTO tyorm_integration_test (name)
          VALUES ($1)
        `,
                parameters: ['Rolled back']
            });

            await connection.rollback();

            const result = await connection.execute({
                sql: `
          SELECT * FROM tyorm_integration_test
          WHERE name = $1
        `,
                parameters: ['Rolled back']
            });

            expect(result.rows).toHaveLength(0);
        } finally {
            await connection.release();
        }
    });

    it('should rollback automatically on release', async () => {
        const connection = await driver.acquireConnection();

        try {
            await connection.beginTransaction();

            const result = await connection.execute<{
                transactionId: number;
            }>({
                sql: 'SELECT pg_backend_pid() AS "transactionId"'
            });

            expect(result.rows).toHaveLength(1);
        } finally {
            await connection.release();
        }

        expect(connection.isReleased).toBe(true);
    });

    it('should reject queries after release', async () => {
        const connection = await driver.acquireConnection();

        await connection.release();

        await expect(
            connection.execute({
                sql: 'SELECT 1'
            })
        ).rejects.toThrow('already been released');
    });

    it('should acquire multiple connections', async () => {
        const first = await driver.acquireConnection();
        const second = await driver.acquireConnection();

        try {
            expect(first.isReleased).toBe(false);
            expect(second.isReleased).toBe(false);

            const result = await second.execute({
                sql: 'SELECT 1 AS value'
            });

            expect(result.rows).toHaveLength(1);
        } finally {
            await first.release();
            await second.release();
        }
    });

    it('should persist committed data across connections', async () => {
        const id = randomUUID();
        const connection = await driver.acquireConnection();

        try {
            await connection.beginTransaction();

            await connection.execute({
                sql: `INSERT INTO ${TEST_TABLE} (id, name) VALUES ($1, $2)`,
                parameters: [id, 'Committed record']
            });

            await connection.commit();
        } finally {
            await connection.release();
        }

        const verifier = await driver.acquireConnection();

        try {
            const result = await verifier.execute<{ name: string }>({
                sql: `SELECT name FROM ${TEST_TABLE} WHERE id = $1`,
                parameters: [id]
            });

            expect(result.rows).toEqual([
                { name: 'Committed record' }
            ]);
        } finally {
            await verifier.release();
        }
    });
    it('should undo inserted data after rollback', async () => {
        const id = randomUUID();
        const connection = await driver.acquireConnection();

        try {
            await connection.beginTransaction();

            await connection.execute({
                sql: `INSERT INTO ${TEST_TABLE} (id, name) VALUES ($1, $2)`,
                parameters: [id, 'Rollback record']
            });

            await connection.rollback();
        } finally {
            await connection.release();
        }

        const verifier = await driver.acquireConnection();

        try {
            const result = await verifier.execute({
                sql: `SELECT id FROM ${TEST_TABLE} WHERE id = $1`,
                parameters: [id]
            });

            expect(result.rows).toHaveLength(0);
        } finally {
            await verifier.release();
        }
    });
    it('should rollback uncommitted changes on release', async () => {
        const id = randomUUID();
        const connection = await driver.acquireConnection();

        await connection.beginTransaction();

        await connection.execute({
            sql: `INSERT INTO ${TEST_TABLE} (id, name) VALUES ($1, $2)`,
            parameters: [id, 'Uncommitted record']
        });

        await connection.release();

        expect(connection.isReleased).toBe(true);

        const verifier = await driver.acquireConnection();

        try {
            const result = await verifier.execute({
                sql: `SELECT id FROM ${TEST_TABLE} WHERE id = $1`,
                parameters: [id]
            });

            expect(result.rows).toHaveLength(0);
        } finally {
            await verifier.release();
        }
    });
    it('should recover after a SQL error and rollback', async () => {
        const connection = await driver.acquireConnection();

        try {
            await connection.beginTransaction();

            await expect(
                connection.execute({
                    sql: 'SELECT * FROM tyorm_table_that_does_not_exist'
                })
            ).rejects.toThrow();

            // PostgreSQL debe rechazar nuevas consultas
            // mientras la transacción esté abortada.
            await expect(
                connection.execute({
                    sql: 'SELECT 1'
                })
            ).rejects.toThrow();

            await connection.rollback();

            // La conexión vuelve a estar operativa.
            const result = await connection.execute<{ value: number }>({
                sql: 'SELECT 1 AS value'
            });

            expect(result.rows[0]?.value).toBe(1);
        } finally {
            await connection.release();
        }
    });
    it('should reject nested transactions', async () => {
        const connection = await driver.acquireConnection();

        try {
            await connection.beginTransaction();

            await expect(
                connection.beginTransaction()
            ).rejects.toThrow('already active');

            await connection.rollback();
        } finally {
            await connection.release();
        }
    });

    it('should reject commit without an active transaction', async () => {
        const connection = await driver.acquireConnection();

        try {
            await expect(
                connection.commit()
            ).rejects.toThrow('no active transaction');
        } finally {
            await connection.release();
        }
    });
    it('should isolate uncommitted changes between connections', async () => {
        const id = randomUUID();

        const writer = await driver.acquireConnection();
        let reader: DatabaseConnection | undefined;

        try {
            reader = await driver.acquireConnection();

            await writer.beginTransaction();

            await writer.execute({
                sql: `INSERT INTO ${TEST_TABLE} (id, name) VALUES ($1, $2)`,
                parameters: [id, 'Isolated record']
            });

            const beforeCommit = await reader.execute({
                sql: `SELECT id FROM ${TEST_TABLE} WHERE id = $1`,
                parameters: [id]
            });

            expect(beforeCommit.rows).toHaveLength(0);

            await writer.commit();

            const afterCommit = await reader.execute({
                sql: `SELECT id FROM ${TEST_TABLE} WHERE id = $1`,
                parameters: [id]
            });

            expect(afterCommit.rows).toHaveLength(1);
        } finally {
            await writer.release();

            if (reader) {
                await reader.release();
            }
        }
    });

    it('preserves unmatched root rows in direct LEFT JOIN queries', async () => {
        const { resolver, inverseQuery, owningQuery } = createLeftJoinFixture();
        const compiler = new PostgresSelectCompiler();
        const connection = await driver.acquireConnection();

        try {
            await connection.beginTransaction();

            await connection.execute({
                sql: 'CREATE TEMP TABLE left_join_departments (' +
                    'department_id integer PRIMARY KEY) ON COMMIT DROP'
            });
            await connection.execute({
                sql: 'CREATE TEMP TABLE left_join_users (' +
                    'user_id integer PRIMARY KEY, ' +
                    'department_fk integer REFERENCES pg_temp.left_join_departments, ' +
                    'status text NOT NULL) ON COMMIT DROP'
            });
            await connection.execute({
                sql: 'INSERT INTO pg_temp.left_join_departments VALUES (1), (2), (3)'
            });
            await connection.execute({
                sql: 'INSERT INTO pg_temp.left_join_users VALUES ' +
                    '(10, 1, $1), (20, 2, $2), (30, NULL, $1)',
                parameters: ['active', 'inactive']
            });

            const inverse = await connection.execute(compiler.compile(
                resolver.resolve(inverseQuery),
                { status: 'active' }
            ));

            expect(inverse.rows).toEqual([
                { department_id: 1, user_id: 10 },
                { department_id: 2, user_id: null },
                { department_id: 3, user_id: null }
            ]);

            const owning = await connection.execute(compiler.compile(
                resolver.resolve(owningQuery)
            ));

            expect(owning.rows).toEqual([
                { user_id: 10, department_id: 1 },
                { user_id: 20, department_id: 2 },
                { user_id: 30, department_id: null }
            ]);

            await connection.commit();
        } finally {
            await connection.release();
        }
    });

});
