import { Column, DataSource, Entity, PrimaryKey } from '@tyorm/core';
import { expect, it } from 'vitest';
import { mysqlProvider } from '../src';

@Entity({ name: 'tyorm_mysql_items' })
class Item {
    @PrimaryKey({ type: 'integer', name: 'item_id' })
    id!: number;

    @Column({ type: 'string', name: 'item_label' })
    label!: string;
}

const database = process.env.MYSQL_TEST_DATABASE;

it.skipIf(!database)('reads repositories through DataSource on MySQL', async () => {
    if (!database) throw new Error('MYSQL_TEST_DATABASE is required.');
    const { driver, compiler } = await mysqlProvider();
    const password = process.env.MYSQL_TEST_PASSWORD;
    const source = await DataSource.connect({
        type: 'mysql', database, entities: [Item], pool: { max: 1 },
        host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
        username: process.env.MYSQL_TEST_USER ?? 'root',
        ...(password === undefined ? {} : { password }),
        providers: { mysql: () => ({ driver, compiler }) }
    });

    try {
        const connection = await driver.acquireConnection();
        try {
            await connection.execute({
                sql: 'CREATE TEMPORARY TABLE tyorm_mysql_items (item_id INT PRIMARY KEY, item_label TEXT NOT NULL)'
            });
            await connection.execute({
                sql: 'INSERT INTO tyorm_mysql_items VALUES (?, ?), (?, ?)',
                parameters: [1, "O'Brien", 2, 'Second']
            });
        } finally {
            await connection.release();
        }

        const repository = source.getRepository(Item);
        await expect(repository.findById(1)).resolves.toMatchObject({ id: 1, label: "O'Brien" });
        await expect(repository.findAll({ offset: 1 })).resolves.toMatchObject([{ id: 2 }]);
        await expect(repository.count()).resolves.toBe(2n);
        await expect(source.transaction(scope => scope.getRepository(Item).existsById(2), {
            isolationLevel: 'READ_COMMITTED', readOnly: true
        })).resolves.toBe(true);
    } finally {
        await source.close();
    }
});
