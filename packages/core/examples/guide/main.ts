import { TransactionManager, type DatabaseConnection, type DriverConfig, type SqlCompiler } from '@tyorm/core';
import { PostgreSQLDriver, PostgresSelectCompiler } from '../../../drivers/postgres/dist/index.js';
import { seed } from './sample-data.js';
import { showQueries } from './queries.js';
import { showProjections } from './projections.js';
import { showTransactions } from './transactions.js';

export async function runGuide(
    config: DriverConfig,
    showLegacy: (connection: DatabaseConnection, compiler: SqlCompiler) => Promise<void>
) {
    const driver = new PostgreSQLDriver();
    const compiler = new PostgresSelectCompiler();

    await driver.connect(config);
    try {
        await showTransactions(new TransactionManager(driver), async connection => {
            await seed(connection);
            await showQueries(connection, compiler);
            await showProjections(connection, compiler);
            await showLegacy(connection, compiler);
        });
    } finally {
        await driver.disconnect();
    }
}
