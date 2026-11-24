import type { DriverProvider } from '@tyorm/core';
import { SqlServerDriver } from './driver/sqlserver-driver';
import { SqlServerSelectCompiler } from './query/compiler';

export const sqlServerProvider: DriverProvider = () => ({
    driver: new SqlServerDriver(),
    compiler: new SqlServerSelectCompiler()
});
