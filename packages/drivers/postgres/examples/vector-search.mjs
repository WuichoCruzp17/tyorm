import { Column, DataSource, Entity, PrimaryKey, column, vectorDistance } from '@tyorm/core';
import { postgresProvider } from '../dist/index.js';

class Document {}

// Native JavaScript calls the decorators directly.
PrimaryKey({ type: 'integer' })(Document.prototype, 'id');
Column({ type: 'vector' })(Document.prototype, 'embedding');
Entity({ name: 'tyorm_vector_example' })(Document);

const { driver, compiler } = await postgresProvider();
const source = await DataSource.connect({
    type: 'postgres',
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'tyorm_test',
    username: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD,
    entities: [Document],
    // The temporary table belongs to one PostgreSQL session.
    pool: { min: 1, max: 1 },
    providers: { postgres: () => ({ driver, compiler }) }
});

try {
    const connection = await driver.acquireConnection();
    try {
        const { rows } = await connection.execute({
            sql: "SELECT to_regtype('vector') IS NOT NULL AS available"
        });
        if (rows[0]?.available !== true) {
            throw new Error('Enable pgvector in the example database before running vector-search.mjs.');
        }

        await connection.execute({
            sql: 'CREATE TEMP TABLE tyorm_vector_example (id INTEGER PRIMARY KEY, embedding vector(2) NOT NULL)'
        });
        await connection.execute({
            sql: 'INSERT INTO tyorm_vector_example (id, embedding) VALUES ($1, $2), ($3, $4), ($5, $6)',
            parameters: [1, '[0,1]', 2, '[1,0]', 3, '[-1,0]']
        });
    } finally {
        await connection.release();
    }

    const distance = vectorDistance(column('d', 'embedding'), [1, 0], 'cosine');
    const { rows } = await source.execute({
        kind: 'select',
        from: { entity: Document, alias: 'd' },
        selections: [
            { expression: column('d', 'id') },
            { expression: distance, alias: 'distance' }
        ],
        joins: [],
        orderBy: [{ expression: distance, direction: 'asc' }],
        distinct: false,
        limit: 2
    });

    console.table(rows);
} finally {
    await source.close();
}
