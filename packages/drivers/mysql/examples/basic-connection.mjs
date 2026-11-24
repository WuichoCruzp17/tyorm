import { TransactionManager } from '@tyorm/core';
import { MySQLDriver } from '../dist/index.js';

const driver = new MySQLDriver();

try {
    await driver.connect({
        type: 'mysql',
        host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
        database: process.env.MYSQL_TEST_DATABASE ?? 'tyorm_test',
        username: process.env.MYSQL_TEST_USER ?? 'root',
        password: process.env.MYSQL_TEST_PASSWORD
    });

    console.log('MySQL disponible:', await driver.ping());

    const manager = new TransactionManager(driver);
    const rows = await manager.withContext(async context => {
        await context.execute({
            sql: `
                CREATE TEMPORARY TABLE tyorm_mysql_basic_example (
                    id INTEGER AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL
                )
            `
        });

        try {
            await context.execute({
                sql: 'INSERT INTO tyorm_mysql_basic_example (name) VALUES (?), (?)',
                parameters: ['Primer registro', 'Segundo registro']
            });

            const result = await context.execute({
                sql: 'SELECT id, name FROM tyorm_mysql_basic_example ORDER BY id'
            });
            return result.rows;
        } finally {
            await context.execute({ sql: 'DROP TEMPORARY TABLE tyorm_mysql_basic_example' });
        }
    });

    console.table(rows);
} finally {
    await driver.disconnect();
}
