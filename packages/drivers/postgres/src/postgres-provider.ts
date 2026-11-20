import type { DriverProvider } from '@tyorm/core';
import { PostgreSQLDriver } from './driver/postgresql-driver';
import { PostgresSelectCompiler } from './query/compiler';

export const postgresProvider: DriverProvider = () => ({
    driver: new PostgreSQLDriver(),
    compiler: new PostgresSelectCompiler()
});
