import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Column, DataSource, Entity, PrimaryKey, type EntityTarget } from '@tyorm/core';
import { expect, it } from 'vitest';
import { sqliteProvider } from '../src';

if (Symbol.metadata === undefined) Object.defineProperty(Symbol, 'metadata', { value: Symbol('Symbol.metadata') });

@Entity({ schema: 'main', name: 'sqlite_schema' })
class SchemaEntry {
    @PrimaryKey({ type: 'string' })
    name!: string;

    @Column({ type: 'string' })
    type!: string;
}

function connectWithTables(entities: readonly EntityTarget[], statements: readonly string[]) {
    return DataSource.connect({
        type: 'sqlite', database: ':memory:', entities,
        providers: {
            sqlite: async () => {
                const provider = await sqliteProvider();
                const connect = provider.driver.connect.bind(provider.driver);
                provider.driver.connect = async config => {
                    await connect(config);
                    const connection = await provider.driver.acquireConnection();
                    try {
                        for (const sql of statements) await connection.execute({ sql });
                    } finally {
                        await connection.release();
                    }
                };
                return provider;
            }
        }
    });
}

it('selects SQLite through DataSource and reads the same database in a transaction', async () => {
    const source = await connectWithTables([SchemaEntry], [
        'CREATE TABLE members (id INTEGER PRIMARY KEY)',
        'CREATE TABLE teams (id INTEGER PRIMARY KEY)'
    ]);
    try {
        const repository = source.getRepository(SchemaEntry);
        await expect(repository.findById('teams')).resolves.toMatchObject({ name: 'teams', type: 'table' });
        await expect(repository.count()).resolves.toBe(2n);
        await expect(repository.findAll({ offset: 1 })).resolves.toMatchObject([{ name: 'teams' }]);
        await expect(source.transaction(async scope =>
            scope.getRepository(SchemaEntry).existsById('members')
        )).resolves.toBe(true);
    } finally {
        await source.close();
    }
});

@Entity({ schema: 'main', name: 'generated_rows' })
class GeneratedRow {
    @PrimaryKey({ type: 'integer', name: 'row_id', generation: 'increment' })
    id!: number;

    @Column({ type: 'string', name: 'row_label', insertable: false })
    label!: string;
}

@Entity({ name: 'settings' })
class Setting {
    @PrimaryKey({ type: 'integer', name: 'tenant_id' })
    tenant!: number;

    @PrimaryKey({ type: 'string', name: 'setting_key' })
    key!: string;

    @Column({ type: 'string', name: 'setting_value', default: 'default' })
    value!: string;
}

it('returns database-generated values and affected rows for explicit mutations', async () => {
    const source = await connectWithTables([GeneratedRow], [
        "CREATE TABLE generated_rows (row_id INTEGER PRIMARY KEY, row_label TEXT NOT NULL DEFAULT 'new')"
    ]);
    try {
        const entity = GeneratedRow;
        await expect(source.executeMutation({ kind: 'insert', entity, values: {} }))
            .resolves.toEqual({ rows: [{ id: 1, label: 'new' }], affectedRows: 1 });

        const repository = source.getRepository(entity);
        const saved = await repository.save({});
        expect(saved).toBeInstanceOf(entity);
        expect(saved).toMatchObject({ id: 2, label: 'new' });
        await expect(repository.save({ id: saved.id, label: "O'Brien" }))
            .resolves.toMatchObject({ id: saved.id, label: "O'Brien" });

        await expect(source.executeMutation({
            kind: 'update', entity, key: { id: 1 }, values: { label: 'updated' }
        })).resolves.toEqual({ rows: [{ id: 1, label: 'updated' }], affectedRows: 1 });
        await expect(source.executeMutation({ kind: 'delete', entity, key: { id: 1 } }))
            .resolves.toEqual({ rows: [{ id: 1, label: 'updated' }], affectedRows: 1 });
        await expect(source.executeMutation({ kind: 'delete', entity, key: { id: 1 } }))
            .resolves.toEqual({ rows: [], affectedRows: 0 });
        await expect(repository.save({ id: 1, label: 'missing' })).rejects.toThrow('Save did not return a row');
    } finally {
        await source.close();
    }
});

it('upserts by the full composite key and rolls back scoped writes', async () => {
    const source = await connectWithTables([Setting], [
        'CREATE TABLE settings (tenant_id INTEGER NOT NULL, setting_key TEXT NOT NULL, setting_value TEXT NOT NULL, PRIMARY KEY (tenant_id, setting_key))'
    ]);
    try {
        const key = { tenant: 1, key: 'locale' };
        const repository = source.getRepository(Setting);
        await repository.save({ ...key, value: 'en' });
        await repository.save({ ...key, tenant: 2, value: 'de' });
        await expect(repository.save(key)).resolves.toMatchObject({ value: 'en' });

        const rollback = new Error('Abort SQLite transaction');
        await expect(source.transaction(async scope => {
            const scoped = scope.getRepository(Setting);
            await expect(scoped.save({ ...key, value: 'fr' })).resolves.toMatchObject({ value: 'fr' });
            await expect(scoped.findById(key)).resolves.toMatchObject({ value: 'fr' });
            await scope.executeMutation({ kind: 'delete', entity: Setting, key: { ...key, tenant: 2 } });
            throw rollback;
        })).rejects.toBe(rollback);

        await expect(repository.findById(key)).resolves.toMatchObject({ value: 'en' });
        await expect(repository.findById({ ...key, tenant: 2 })).resolves.toMatchObject({ value: 'de' });

        await source.transaction(scope => scope.getRepository(Setting).save({ ...key, value: 'es' }));
        await expect(repository.findById(key)).resolves.toMatchObject({ value: 'es' });
        await expect(repository.count()).resolves.toBe(2n);
    } finally {
        await source.close();
    }
});

it('persists committed writes after closing and reopening a database file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tyorm-sqlite-'));
    const database = join(directory, 'persisted.sqlite');
    const options = {
        type: 'sqlite', database, entities: [Setting], providers: { sqlite: sqliteProvider }
    };
    const key = { tenant: 1, key: 'locale' };

    try {
        const setup = new DatabaseSync(database);
        try {
            setup.exec(
                'CREATE TABLE settings (tenant_id INTEGER NOT NULL, setting_key TEXT NOT NULL, setting_value TEXT NOT NULL, PRIMARY KEY (tenant_id, setting_key))'
            );
        } finally {
            setup.close();
        }

        const source = await DataSource.connect(options);
        try {
            await source.transaction(scope =>
                scope.getRepository(Setting).save({ ...key, value: 'es' })
            );
        } finally {
            await source.close();
        }

        const reopened = await DataSource.connect(options);
        try {
            await expect(reopened.getRepository(Setting).findById(key))
                .resolves.toMatchObject({ ...key, value: 'es' });
        } finally {
            await reopened.close();
        }
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
