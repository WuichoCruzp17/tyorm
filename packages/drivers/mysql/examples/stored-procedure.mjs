import { randomUUID } from 'node:crypto';
import { MySQLDriver } from '../dist/index.js';

const driver = new MySQLDriver();
const password = process.env.MYSQL_TEST_PASSWORD;
const procedure = `tyorm_example_${randomUUID().replaceAll('-', '')}`;
let created = false;

try {
    await driver.connect({
        type: 'mysql',
        host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
        database: process.env.MYSQL_TEST_DATABASE ?? 'tyorm_test',
        username: process.env.MYSQL_TEST_USER ?? 'root',
        ...(password === undefined ? {} : { password })
    });

    const connection = await driver.acquireConnection();
    try {
        await connection.execute({
            sql: `CREATE PROCEDURE \`${procedure}\`(IN input_value VARCHAR(100), OUT output_value VARCHAR(100), INOUT total_value INT) BEGIN SET output_value = CONCAT(input_value, ':processed'); SET total_value = total_value + 1; SELECT input_value AS received; END`
        });
        created = true;

        const result = await connection.callProcedure(procedure, [
            { mode: 'in', value: 'TyORM' },
            { mode: 'out' },
            { mode: 'inout', value: 4 }
        ]);
        console.table(result.resultSets[0] ?? []);
        console.log('Parámetros OUT/INOUT:', result.outputParameters);
    } finally {
        try {
            if (created) {
                await connection.execute({ sql: `DROP PROCEDURE \`${procedure}\`` });
            }
        } finally {
            await connection.release();
        }
    }
} finally {
    await driver.disconnect();
}
