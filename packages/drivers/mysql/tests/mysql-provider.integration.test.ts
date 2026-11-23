import { randomUUID } from 'node:crypto';
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

@Entity({ name: 'tyorm_mysql_generated' })
class Generated {
    @PrimaryKey({ type: 'integer', name: 'row_id', generation: 'increment' })
    id!: number;

    @Column({ type: 'string' })
    label!: string;
}

@Entity({ name: 'tyorm_mysql_settings' })
class Setting {
    @PrimaryKey({ type: 'integer' })
    tenant!: number;

    @PrimaryKey({ type: 'string', name: 'setting_key' })
    key!: string;

    @Column({ type: 'string', name: 'setting_value' })
    value!: string;
}

const database = process.env.MYSQL_TEST_DATABASE;

it.skipIf(!database)('reads and writes repositories through DataSource on MySQL', async () => {
    if (!database) throw new Error('MYSQL_TEST_DATABASE is required.');
    const { driver, compiler } = await mysqlProvider();
    const password = process.env.MYSQL_TEST_PASSWORD;
    const source = await DataSource.connect({
        type: 'mysql', database, entities: [Item, Generated, Setting], pool: { max: 1 },
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
            await connection.execute({
                sql: 'CREATE TEMPORARY TABLE tyorm_mysql_generated (row_id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(50) NOT NULL)'
            });
            await connection.execute({
                sql: 'CREATE TEMPORARY TABLE tyorm_mysql_settings (tenant INT NOT NULL, setting_key VARCHAR(50) NOT NULL, setting_value VARCHAR(50) NOT NULL UNIQUE, PRIMARY KEY (tenant, setting_key))'
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

        const generated = source.getRepository(Generated);
        const saved = await generated.save({ label: "O'Brien" });
        expect(saved).toBeInstanceOf(Generated);
        expect(saved.id).toBeGreaterThan(0);
        const { rows, affectedRows } = await source.executeMutation({
            kind: 'update', entity: Generated, key: { id: saved.id }, values: { label: 'Updated' }
        });
        expect({ rows, affectedRows }).toEqual({ rows: [{ id: saved.id, label: 'Updated' }], affectedRows: 1 });

        const settings = source.getRepository(Setting);
        const key = { tenant: 1, key: 'locale' };
        await settings.save({ ...key, value: 'es' });
        await expect(settings.save({ ...key, value: 'en' })).resolves.toMatchObject({ ...key, value: 'en' });
        await expect(settings.save({ ...key, tenant: 2, value: 'en' })).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
        await expect(settings.findById({ ...key, tenant: 2 })).resolves.toBeNull();

        const abort = new Error('Abort');
        await expect(source.transaction(async scope => {
            await scope.getRepository(Setting).save({ ...key, value: 'fr' });
            await expect(scope.executeMutation({
                kind: 'delete', entity: Generated, key: { id: saved.id }
            })).resolves.toMatchObject({ rows: [{ id: saved.id, label: 'Updated' }], affectedRows: 1 });
            throw abort;
        })).rejects.toBe(abort);
        await expect(settings.findById(key)).resolves.toMatchObject({ value: 'en' });
        await expect(generated.findById(saved.id)).resolves.toMatchObject({ label: 'Updated' });
        await expect(source.executeMutation({ kind: 'delete', entity: Generated, key: { id: saved.id } }))
            .resolves.toMatchObject({ affectedRows: 1 });
        await expect(source.executeMutation({ kind: 'delete', entity: Generated, key: { id: saved.id } }))
            .resolves.toEqual({ rows: [], affectedRows: 0 });
    } finally {
        await source.close();
    }
});

it.skipIf(!database)('calls a stored procedure on a MySQL transaction session', async () => {
    if (!database) throw new Error('MYSQL_TEST_DATABASE is required.');
    const { driver } = await mysqlProvider();
    const password = process.env.MYSQL_TEST_PASSWORD;

    await driver.connect({
        type: 'mysql', database,
        host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
        username: process.env.MYSQL_TEST_USER ?? 'root',
        ...(password === undefined ? {} : { password })
    });

    const connection = await driver.acquireConnection();
    try {
        await connection.execute({
            sql: 'DROP PROCEDURE IF EXISTS tyorm_mysql_read_values'
        });
        await connection.execute({
            sql: 'CREATE PROCEDURE tyorm_mysql_read_values(IN input_value VARCHAR(50), IN total_value INT) BEGIN SELECT input_value AS value, total_value AS total; SELECT total_value + 1 AS next_total; END'
        });

        await connection.beginTransaction();
        await expect(connection.callProcedure(
            'tyorm_mysql_read_values',
            ["O'Reilly", 2]
        )).resolves.toEqual({
            resultSets: [
                [{ value: "O'Reilly", total: 2 }],
                [{ next_total: 3 }]
            ],
            affectedRows: 0
        });
        await connection.commit();
    } finally {
        try {
            await connection.execute({
                sql: 'DROP PROCEDURE IF EXISTS tyorm_mysql_read_values'
            });
        } finally {
            await connection.release();
            await driver.disconnect();
        }
    }
});

@Entity({ name: 'tyorm_mysql_concurrent' })
class ConcurrentItem {
    @PrimaryKey({ type: 'string' })
    id!: string;

    @Column({ type: 'string' })
    label!: string;
}

it.skipIf(!database)('saves the same assigned key from two overlapping MySQL transactions', async () => {
    if (!database) throw new Error('MYSQL_TEST_DATABASE is required.');
    const { driver, compiler } = await mysqlProvider();
    const password = process.env.MYSQL_TEST_PASSWORD;
    const source = await DataSource.connect({
        type: 'mysql', database, entities: [ConcurrentItem], pool: { max: 2 },
        host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
        username: process.env.MYSQL_TEST_USER ?? 'root',
        ...(password === undefined ? {} : { password }),
        providers: { mysql: () => ({ driver, compiler }) }
    });
    const id = randomUUID();

    try {
        const connection = await driver.acquireConnection();
        try {
            await connection.execute({
                sql: 'CREATE TABLE IF NOT EXISTS tyorm_mysql_concurrent (id VARCHAR(36) PRIMARY KEY, label VARCHAR(50) NOT NULL) ENGINE=InnoDB'
            });
        } finally {
            await connection.release();
        }

        const options = { isolationLevel: 'READ_COMMITTED' } as const;
        let competing: Promise<ConcurrentItem> | undefined;
        try {
            const first = await source.transaction(async scope => {
                const inserted = await scope.getRepository(ConcurrentItem).save({ id, label: 'first' });
                let signalStarted!: () => void;
                const started = new Promise<void>(resolve => { signalStarted = resolve; });
                competing = source.transaction(async other => {
                    const write = other.getRepository(ConcurrentItem).save({ id, label: 'second' });
                    signalStarted();
                    return write;
                }, options);
                void competing.then(signalStarted, signalStarted);
                await started;
                return inserted;
            }, options);

            expect(first).toMatchObject({ id, label: 'first' });
            await expect(competing).resolves.toMatchObject({ id, label: 'second' });
            await expect(source.getRepository(ConcurrentItem).findById(id))
                .resolves.toMatchObject({ id, label: 'second' });
        } finally {
            await competing?.catch(() => undefined);
            await source.executeMutation({ kind: 'delete', entity: ConcurrentItem, key: { id } });
        }
    } finally {
        await source.close();
    }
});
