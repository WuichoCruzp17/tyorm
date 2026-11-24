import { describe, expect, it } from 'vitest';
import { PostgreSQLDriver, PostgresSelectCompiler, postgresProvider } from '../src';
import * as postgresApi from '../src';

describe('postgresProvider', () => {
    it('creates a PostgreSQL driver and compiler for each data source', async () => {
        const first = await postgresProvider();
        const second = await postgresProvider();

        expect(first.driver).toBeInstanceOf(PostgreSQLDriver);
        expect(first.compiler).toBeInstanceOf(PostgresSelectCompiler);
        expect(first.driver).not.toBe(second.driver);
    });

    it('does not export the internal SQL dialect implementation', () => {
        expect(postgresApi).not.toHaveProperty('PostgresSqlDialect');
    });
});
