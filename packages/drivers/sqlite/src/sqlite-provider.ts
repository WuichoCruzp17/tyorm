import type { DriverProvider } from '@tyorm/core';
import { SQLiteDriver } from './driver/sqlite-driver';
import { SQLiteSelectCompiler } from './query/compiler';

export const sqliteProvider: DriverProvider = () => ({
    driver: new SQLiteDriver(),
    compiler: new SQLiteSelectCompiler()
});
