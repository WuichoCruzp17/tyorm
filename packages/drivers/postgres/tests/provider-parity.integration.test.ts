import { describe, expect, it } from 'vitest';
import {
    Column, DataSource, Entity, JoinColumn, ManyToOne, PrimaryKey,
    column, count, eq, gte, param, type DataSourceOptions, type DriverProvider, type SelectQuery
} from '@tyorm/core';
import { postgresProvider } from '../src';
import { sqliteProvider } from '../../sqlite/src';

@Entity({ name: 'parity_groups' })
class Group {
    @PrimaryKey({ type: 'integer', name: 'group_id' })
    id!: number;

    @Column({ type: 'string', name: 'group_name' })
    name!: string;
}

@Entity({ name: 'parity_entries' })
class Entry {
    @PrimaryKey({ type: 'integer', name: 'owner_id' })
    groupId!: number;

    @PrimaryKey({ type: 'string', name: 'entry_key' })
    key!: string;

    @Column({ type: 'string', nullable: true })
    label!: string | null;

    @ManyToOne(() => Group)
    @JoinColumn({ name: 'group_fk', referencedColumnName: 'group_id' })
    group!: Group;
}

@Entity({ name: 'parity_generated' })
class Generated {
    @PrimaryKey({ type: 'integer', name: 'generated_id', generation: 'increment' })
    id!: number;
}

const password = process.env.PGPASSWORD;
const providers = [
    {
        provider: postgresProvider,
        config: {
            type: 'postgres',
            host: process.env.PGHOST ?? 'localhost',
            port: Number(process.env.PGPORT ?? 5432),
            database: process.env.PGDATABASE ?? 'tyorm_test',
            username: process.env.PGUSER ?? 'postgres',
            ...(password === undefined ? {} : { password }),
            pool: { min: 1, max: 1 }
        },
        generatedKey: 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY'
    },
    {
        provider: sqliteProvider,
        config: { type: 'sqlite', database: ':memory:' },
        generatedKey: 'INTEGER PRIMARY KEY'
    }
] satisfies readonly {
    provider: DriverProvider;
    config: Omit<DataSourceOptions, 'entities' | 'providers'>;
    generatedKey: string;
}[];

const key = { groupId: 1, key: 'shared' };

describe.each(providers)('DataSource contract ($config.type)', ({ provider, config, generatedKey }) => {
    async function withSource(run: (source: DataSource) => Promise<void>): Promise<void> {
        const source = await DataSource.connect({
            ...config,
            entities: [Group, Entry, Generated],
            providers: {
                [config.type]: async () => {
                    const { driver, compiler } = await provider();
                    const connect = driver.connect.bind(driver);
                    driver.connect = async options => {
                        await connect(options);
                        const connection = await driver.acquireConnection();
                        try {
                            await connection.execute({
                                sql: 'CREATE TEMP TABLE parity_groups (group_id INTEGER PRIMARY KEY, group_name TEXT NOT NULL)'
                            });
                            await connection.execute({
                                sql: 'CREATE TEMP TABLE parity_entries (owner_id INTEGER NOT NULL, entry_key TEXT NOT NULL, label TEXT, group_fk INTEGER GENERATED ALWAYS AS (owner_id) STORED, PRIMARY KEY (owner_id, entry_key))'
                            });
                            await connection.execute({
                                sql: `CREATE TEMP TABLE parity_generated (generated_id ${generatedKey})`
                            });
                        } finally {
                            await connection.release();
                        }
                    };
                    return { driver, compiler };
                }
            }
        });

        try {
            await source.getRepository(Group).save({ id: 1, name: 'One' });
            await source.getRepository(Group).save({ id: 2, name: 'Two' });
            await source.getRepository(Entry).save({ ...key, label: "O'Brien" });
            await source.getRepository(Entry).save({ ...key, groupId: 2, label: null });
            await run(source);
        } finally {
            await source.close();
        }
    }

    it('reads composite keys and paginates using stable key ordering', () => withSource(async source => {
        const entries = source.getRepository(Entry);
        await expect(entries.findById(key)).resolves.toMatchObject({ ...key, label: "O'Brien" });
        await expect(entries.findById({ ...key, groupId: 3 })).resolves.toBeNull();
        await expect(entries.findAll({ orderBy: { key: 'asc' }, offset: 1 })).resolves.toMatchObject([
            { ...key, groupId: 2, label: null }
        ]);
        await expect(entries.count()).resolves.toBe(2n);
    }));

    it('resolves a relation with named filters, grouping and an aggregate', () => withSource(async source => {
        const groupName = column('g', 'name');
        const total = count();
        const query: SelectQuery = {
            kind: 'select',
            from: { entity: Entry, alias: 'e' },
            selections: [{ expression: groupName, alias: 'name' }, { expression: total, alias: 'total' }],
            joins: [{ kind: 'join', type: 'inner', sourceAlias: 'e', relation: 'group', alias: 'g' }],
            where: eq(column('e', 'label'), param('label')),
            groupBy: [groupName],
            having: gte(total, param('minimum')),
            orderBy: [],
            distinct: false
        };
        const { rows } = await source.execute(query, { label: "O'Brien", minimum: 1 });
        expect(rows.map(row => ({ name: row.name, total: String(row.total) }))).toEqual([
            { name: 'One', total: '1' }
        ]);
    }));

    it('returns generated keys and preserves the transaction outcome', () => withSource(async source => {
        const saved = await source.getRepository(Generated).save({});
        expect(saved).toBeInstanceOf(Generated);
        expect(saved.id).toBeGreaterThan(0);

        await source.transaction(scope => scope.getRepository(Entry).save({ ...key, label: 'committed' }));
        const rollback = new Error('Abort contract transaction');
        await expect(source.transaction(async scope => {
            const removed = await scope.executeMutation({ kind: 'delete', entity: Entry, key });
            expect(removed).toMatchObject({ affectedRows: 1, rows: [{ ...key, label: 'committed' }] });
            await expect(scope.getRepository(Entry).findById(key)).resolves.toBeNull();
            throw rollback;
        })).rejects.toBe(rollback);
        await expect(source.getRepository(Entry).findById(key)).resolves.toMatchObject({ label: 'committed' });
    }));
});
