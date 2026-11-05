
import { PostgreSQLDriver } from '../dist/index.js';

const driver = new PostgreSQLDriver();

let connection;

async function main() {
  try {
    console.log('Conectando a PostgreSQL...');

    await driver.connect({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'tyorm_test',
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'tu_password',
      pool: {
        min: 1,
        max: 5,
        acquireTimeoutMs: 5000,
        idleTimeoutMs: 30000
      }
    });

    console.log('Conexión establecida.');

    // Verificar conexión
    console.log('\n1. Verificando conexión...');

    const ping = await driver.ping();
    console.log('Ping:', ping);

    // Adquirir conexión
    connection = await driver.acquireConnection();

    // Consulta parametrizada
    console.log('\n2. Ejecutando consulta parametrizada...');

    const result = await connection.execute({
      sql: 'SELECT $1::text AS message, $2::integer AS number',
      parameters: ['Hola desde TyORM', 123]
    });

    console.log('Resultado:', result.rows);

    // Crear tabla temporal
    console.log('\n3. Creando tabla temporal...');

    await connection.execute({
      sql: `
        CREATE TEMP TABLE tyorm_test (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL
        )
      `
    });

    // Iniciar transacción
    console.log('\n4. Iniciando transacción...');

    await connection.beginTransaction({
      isolationLevel: 'READ_COMMITTED'
    });

    await connection.execute({
      sql: 'INSERT INTO tyorm_test (name) VALUES ($1)',
      parameters: ['Primer registro']
    });

    await connection.execute({
      sql: 'INSERT INTO tyorm_test (name) VALUES ($1)',
      parameters: ['Segundo registro']
    });

    await connection.commit();

    console.log('Transacción confirmada.');

    // Consultar registros
    console.log('\n5. Consultando registros...');

    const records = await connection.execute({
      sql: 'SELECT * FROM tyorm_test ORDER BY id'
    });

    console.table(records.rows);

    console.log('Filas afectadas:', records.affectedRows);

    console.log('\n¡Prueba completada correctamente!');

  } catch (error) {
    console.error('\nError durante la prueba:', error);

    if (connection && !connection.isReleased) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error en rollback:', rollbackError);
      }
    }

    process.exitCode = 1;

  } finally {
    if (connection && !connection.isReleased) {
      await connection.release();
      console.log('\nConexión liberada.');
    }

    await driver.disconnect();
    console.log('Pool cerrado.');
  }
}

main();
