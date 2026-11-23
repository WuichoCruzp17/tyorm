import { TransactionManager } from '@tyorm/core';
import { PostgreSQLDriver } from '../dist/index.js';

const driver = new PostgreSQLDriver();

try {
    await driver.connect({
        type: 'postgres',
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? 'tyorm_test',
        username: process.env.PGUSER ?? 'postgres',
        password: process.env.PGPASSWORD
    });

    console.log('PostgreSQL disponible:', await driver.ping());

    const manager = new TransactionManager(driver);
    const rows = await manager.withContext(async context => {
        await context.execute({
            sql: `
                CREATE TEMP TABLE tyorm_example (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    name TEXT NOT NULL
                ) ON COMMIT DROP
            `
        });

        await context.execute({
            sql: 'INSERT INTO tyorm_example (name) VALUES ($1), ($2)',
            parameters: ['Primer registro', 'Segundo registro']
        });

        const result = await context.execute({
            sql: 'SELECT id, name FROM tyorm_example ORDER BY id'
        });
        return result.rows;
    });

    console.table(rows);
} finally {
    await driver.disconnect();
}
