import { TransactionManager, type DatabaseConnection } from '@tyorm/core';

export async function showTransactions(
    manager: TransactionManager,
    demo: (connection: DatabaseConnection) => Promise<void>
) {
    await manager.transaction(demo, { isolationLevel: 'READ_COMMITTED' });
    console.log('Transacción de la guía confirmada.');

    const abort = new Error('Cancelación intencional de la demostración.');
    try {
        await manager.transaction(async connection => {
            await connection.execute({
                sql: 'CREATE TEMP TABLE demo_rollback (value integer) ON COMMIT DROP'
            });
            await connection.execute({
                sql: 'INSERT INTO pg_temp.demo_rollback VALUES ($1)',
                parameters: [42]
            });
            throw abort;
        });
    } catch (error) {
        if (error !== abort) {
            throw error;
        }
        console.log('Rollback ejecutado. Causa original:', abort.message);
    }

    const value = await manager.withContext(async context => {
        const result = await context.execute<{ value: number }>({
            sql: 'SELECT $1::integer AS value',
            parameters: [100]
        });
        return result.rows[0]?.value;
    });
    console.log('Consulta en contexto administrado:', value);
}
