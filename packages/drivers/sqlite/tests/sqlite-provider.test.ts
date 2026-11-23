import { Column, DataSource, Entity, PrimaryKey } from '@tyorm/core';
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

it('selects SQLite through DataSource and reads the same database in a transaction', async () => {
    const source = await DataSource.connect({
        type: 'sqlite', database: ':memory:', entities: [SchemaEntry],
        providers: {
            sqlite: async () => {
                const provider = await sqliteProvider();
                const connect = provider.driver.connect.bind(provider.driver);
                provider.driver.connect = async config => {
                    await connect(config);
                    const connection = await provider.driver.acquireConnection();
                    try {
                        await connection.execute({ sql: 'CREATE TABLE members (id INTEGER PRIMARY KEY)' });
                        await connection.execute({ sql: 'CREATE TABLE teams (id INTEGER PRIMARY KEY)' });
                    } finally {
                        await connection.release();
                    }
                };
                return provider;
            }
        }
    });
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
