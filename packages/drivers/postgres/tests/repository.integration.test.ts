import { describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryKey, ReadRepository, RepositoryDecorator as Repository, eq, literal } from '@tyorm/core';
import { postgresProvider } from '../src';

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
