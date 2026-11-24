import { Column, DataSource, Entity, PrimaryKey } from '@tyorm/core';
import { mysqlProvider } from '../dist/index.js';

class ExampleUser {}

PrimaryKey({ type: 'integer', name: 'id', generation: 'increment' })(ExampleUser.prototype, 'id');
Column({ type: 'string', name: 'name' })(ExampleUser.prototype, 'name');
Entity({ name: 'tyorm_mysql_repository_example' })(ExampleUser);

const { driver, compiler } = await mysqlProvider();
const password = process.env.MYSQL_TEST_PASSWORD;
const source = await DataSource.connect({
    type: 'mysql',
    host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
    database: process.env.MYSQL_TEST_DATABASE ?? 'tyorm_test',
    username: process.env.MYSQL_TEST_USER ?? 'root',
    ...(password === undefined ? {} : { password }),
    entities: [ExampleUser],
    pool: { min: 1, max: 1 },
    providers: { mysql: () => ({ driver, compiler }) }
});

try {
    const connection = await driver.acquireConnection();
    try {
        await connection.execute({
            sql: `
                CREATE TEMPORARY TABLE tyorm_mysql_repository_example (
                    id INTEGER AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL
                )
            `
        });
    } finally {
        await connection.release();
    }

    const users = source.getRepository(ExampleUser);
    const created = await users.save({ name: 'Ada Lovelace' });
    const found = await users.findById(created.id);
    const all = await users.findAll({ orderBy: { name: 'asc' } });

    console.log('Guardado:', created);
    console.log('Encontrado por ID:', found);
    console.log('Total:', await users.count());
    console.table(all);
} finally {
    try {
        const connection = await driver.acquireConnection();
        try {
            await connection.execute({ sql: 'DROP TEMPORARY TABLE IF EXISTS tyorm_mysql_repository_example' });
        } finally {
            await connection.release();
        }
    } finally {
        await source.close();
    }
}
