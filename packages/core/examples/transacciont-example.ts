import { TransactionManager } from '@tyorm/core';
import { PostgreSQLDriver } from '@tyorm/postgres';

const driver = new PostgreSQLDriver();

await driver.connect({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'tyorm_test',
  username: 'postgres',
  password: process.env.PGPASSWORD!,
  pool: {
    min: 1,
    max: 5
  }
});

const transactionManager = new TransactionManager(driver);

try {
  const result = await transactionManager.transaction(
    async (connection) => {
      const response = await connection.execute<{
        value: number;
      }>({
        sql: 'SELECT $1::integer AS value',
        parameters: [100]
      });

      return response.rows[0]?.value;
    }
  );

  console.log('Transaction result:', result);
} finally {
  await driver.disconnect();
}
