import { describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryKey, ReadRepository, RepositoryDecorator as Repository, eq, literal, type DriverConfig } from '@tyorm/core';
import { PostgreSQLDriver, postgresProvider } from '../src';

@Entity({ schema: 'pg_catalog', name: 'pg_type' })
class PgType {
    @PrimaryKey({ type: 'integer', name: 'oid' })
    id!: number;

    @Column({ type: 'string', name: 'typname' })
    name!: string;
}

@Repository(PgType)
class PgTypeRepository extends ReadRepository<PgType, number> {
    findByName(name: string): Promise<PgType[]> {
        return this.findAll({ where: eq(this.column('name'), literal(name)) });
    }
}

@Entity({ schema: 'pg_catalog', name: 'pg_attribute' })
class PgAttribute {
    @PrimaryKey({ type: 'integer', name: 'attrelid' })
    relationId!: number;

    @PrimaryKey({ type: 'integer', name: 'attnum' })
    number!: number;

    @Column({ type: 'string', name: 'attname' })
    name!: string;
}

@Entity({ schema: 'pg_catalog', name: 'pg_settings' })
class PgSetting {
    @PrimaryKey({ type: 'string', name: 'name' })
    name!: string;

    @Column({ type: 'string', name: 'setting' })
    value!: string;
}

describe('PostgreSQL read repositories', () => {
    it('queries the catalog with simple and composite keys', async () => {
        const password = process.env.PGPASSWORD;
        const source = await DataSource.connect({
            type: 'postgres',
            providers: { postgres: postgresProvider },
            entities: [PgType, PgAttribute, PgSetting],
            host: process.env.PGHOST ?? 'localhost',
            port: Number(process.env.PGPORT ?? 5432),
            database: process.env.PGDATABASE ?? 'tyorm_test',
            username: process.env.PGUSER ?? 'postgres',
            ...(password === undefined ? {} : { password })
        });

        try {
            const types = source.getRepository(PgType);
            const page = await types.findAll({ orderBy: { name: 'asc' }, limit: 2, offset: 1 });
            expect(page).toHaveLength(2);
            const [first] = page;
            expect(first).toBeInstanceOf(PgType);
            if (!first) throw new Error('Expected a PostgreSQL type.');

            await expect(types.findById(first.id)).resolves.toEqual(first);
            await expect(types.existsById(first.id)).resolves.toBe(true);
            await expect(types.count()).resolves.toBeGreaterThan(2n);

            const custom = source.getRepository(PgTypeRepository);
            await expect(custom.findByName(first.name)).resolves.toContainEqual(first);
            await expect(custom.findById(first.id)).resolves.toEqual(first);

            const scoped = await source.transaction(async scope => {
                const repository = scope.getRepository(PgTypeRepository);
                await expect(repository.findByName(first.name)).resolves.toContainEqual(first);
                await expect(scope.getRepository(PgType).findById(first.id)).resolves.toEqual(first);
                const settings = scope.getRepository(PgSetting);
                await expect(settings.findById('transaction_isolation')).resolves.toMatchObject({ value: 'serializable' });
                await expect(settings.findById('transaction_read_only')).resolves.toMatchObject({ value: 'on' });
                return repository;
            }, { isolationLevel: 'SERIALIZABLE', readOnly: true });
            await expect(scoped.findById(first.id)).rejects.toThrow('TransactionContext is no longer active.');

            const failure = new Error('Abort transaction');
            await expect(source.transaction(async scope => {
                await expect(scope.getRepository(PgType).findById(first.id)).resolves.toEqual(first);
                throw failure;
            })).rejects.toBe(failure);
            await expect(types.findById(first.id)).resolves.toEqual(first);

            const attributes = source.getRepository(PgAttribute);
            const [attribute] = await attributes.findAll({ limit: 1 });
            if (!attribute) throw new Error('Expected a PostgreSQL attribute.');
            const key = { relationId: attribute.relationId, number: attribute.number };
            await expect(attributes.findById(key)).resolves.toEqual(attribute);
            await expect(attributes.existsById(key)).resolves.toBe(true);
            await expect(attributes.findById({ ...key, number: -32768 })).resolves.toBeNull();
        } finally {
            await source.close();
        }
    });
});

@Entity({ schema: 'pg_temp', name: 'tyorm_mutation_test' })
class MutationRow {
    @PrimaryKey({ type: 'integer', name: 'row_id', generation: 'increment' })
    id!: number;

    @Column({ type: 'string', name: 'row_label' })
    label!: string;
}

@Entity({ schema: 'pg_temp', name: 'tyorm_save_test' })
class AssignedRow {
    @PrimaryKey({ type: 'string', name: 'row_key' })
    key!: string;

    @Column({ type: 'string', name: 'row_label', default: 'default' })
    label!: string;
}

@Repository(AssignedRow)
class AssignedRepository extends ReadRepository<AssignedRow, string> {}

class TemporaryTableDriver extends PostgreSQLDriver {
    override async connect(config: DriverConfig): Promise<void> {
        await super.connect(config);
        const connection = await this.acquireConnection();
        try {
            await connection.execute({
                sql: 'CREATE TEMP TABLE tyorm_mutation_test (row_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, row_label text NOT NULL)'
            });
            await connection.execute({
                sql: 'CREATE TEMP TABLE tyorm_save_test (row_key text PRIMARY KEY, row_label text NOT NULL)'
            });
        } finally {
            await connection.release();
        }
    }
}

it('writes a temporary table and shares mutations with transactional repositories', async () => {
    const password = process.env.PGPASSWORD;
    const source = await DataSource.connect({
        type: 'postgres',
        providers: { postgres: () => ({ ...postgresProvider(), driver: new TemporaryTableDriver() }) },
        entities: [MutationRow, AssignedRow],
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? 'tyorm_test',
        username: process.env.PGUSER ?? 'postgres',
        pool: { min: 1, max: 1 },
        ...(password === undefined ? {} : { password })
    });

    try {
        const entity = MutationRow;
        const label = "O'Brien";
        const inserted = await source.executeMutation({ kind: 'insert', entity, values: { label } });
        const id = inserted.rows[0]?.id;
        if (typeof id !== 'number') throw new Error('Expected a generated integer key.');
        expect(inserted).toMatchObject({ affectedRows: 1, rows: [{ id, label }] });

        const rollback = new Error('Undo update');
        await expect(source.transaction(async scope => {
            await expect(scope.executeMutation({
                kind: 'update', entity, key: { id }, values: { label: 'updated' }
            })).resolves.toMatchObject({ affectedRows: 1, rows: [{ id, label: 'updated' }] });
            await expect(scope.getRepository(entity).findById(id)).resolves.toMatchObject({ label: 'updated' });
            throw rollback;
        })).rejects.toBe(rollback);

        const repository = source.getRepository(entity);
        await expect(repository.findById(id)).resolves.toMatchObject({ label });

        const newRow = { label: 'saved' };
        const saved = await repository.save(newRow);
        expect(saved).toBeInstanceOf(MutationRow);
        expect(saved.id).toBeGreaterThan(id);
        expect(newRow).toEqual({ label: 'saved' });
        await expect(repository.save({ id: saved.id, label: 'edited' }))
            .resolves.toMatchObject({ id: saved.id, label: 'edited' });
        await expect(repository.save({ id: -1, label: 'missing' })).rejects.toThrow('Save did not return a row');

        const assigned = source.getRepository(AssignedRepository);
        await expect(assigned.save({ key: 'item', label: 'initial' }))
            .resolves.toMatchObject({ key: 'item', label: 'initial' });
        await expect(assigned.save({ key: 'item' })).resolves.toMatchObject({ label: 'initial' });
        await expect(source.transaction(async scope => {
            const transactional = scope.getRepository(AssignedRepository);
            await expect(transactional.save({ key: 'item', label: 'rolled back' }))
                .resolves.toMatchObject({ label: 'rolled back' });
            throw rollback;
        })).rejects.toBe(rollback);
        await expect(assigned.findById('item')).resolves.toMatchObject({ label: 'initial' });
        await expect(assigned.save({ key: 'item', label: 'committed' }))
            .resolves.toMatchObject({ label: 'committed' });
        await expect(assigned.count()).resolves.toBe(1n);
        await expect(source.transaction(scope =>
            scope.executeMutation({ kind: 'delete', entity, key: { id } })
        )).resolves.toMatchObject({ affectedRows: 1, rows: [{ id, label }] });
        await expect(repository.findById(id)).resolves.toBeNull();
        await expect(source.executeMutation({ kind: 'delete', entity, key: { id } }))
            .resolves.toMatchObject({ affectedRows: 0, rows: [] });
    } finally {
        await source.close();
    }
});
