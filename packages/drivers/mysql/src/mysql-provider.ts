import type { DriverProvider } from '@tyorm/core';
import { MySQLDriver } from './driver/mysql-driver';
import { MySQLSelectCompiler } from './query/compiler';

export const mysqlProvider: DriverProvider = () => ({
    driver: new MySQLDriver(),
    compiler: new MySQLSelectCompiler()
});
