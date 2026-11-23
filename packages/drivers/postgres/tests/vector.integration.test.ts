import { it, expect } from 'vitest';
import { Column, DataSource, Entity, PrimaryKey, column, vectorDistance } from '@tyorm/core';
import { postgresProvider } from '../src';

@Entity({ name: 'vector_documents' })
class Document {
    @PrimaryKey({ type: 'integer' })
    id!: number;

    @Column({ type: 'vector' })
    embedding!: unknown;
}

it('ranks nearest neighbors using pgvector', async ({ skip }) => {
    const { driver, compiler } = await postgresProvider();
    const password = process.env.PGPASSWORD;
    const config = {
        type: 'postgres', database: process.env.PGDATABASE ?? 'tyorm_test',
        host: process.env.PGHOST ?? 'localhost', port: Number(process.env.PGPORT ?? 5432),
        username: process.env.PGUSER ?? 'postgres',
        ...(password === undefined ? {} : { password }),
        pool: { min: 1, max: 1 }
    };

    const source = await DataSource.connect({
        ...config, entities: [Document], providers: { postgres: () => ({ driver, compiler }) }
    });
    try {
        const connection = await driver.acquireConnection();
        try {
            const { rows } = await connection.execute<{ available: boolean }>({
                sql: "SELECT to_regtype('vector') IS NOT NULL AS available"
            });
            if (rows[0]?.available !== true) {
                skip('pgvector is not enabled in the test database search path');
                return;
            }
            await connection.execute({
                sql: 'CREATE TEMP TABLE vector_documents (id INTEGER PRIMARY KEY, embedding vector(2) NOT NULL)'
            });
            await connection.execute({
                sql: 'INSERT INTO vector_documents VALUES ($1, $2), ($3, $4), ($5, $6)',
                parameters: [1, '[0,1]', 2, '[1,0]', 3, '[-1,0]']
            });
        } finally {
            await connection.release();
        }

        const nearest = (metric: 'l2' | 'cosine', embedding: readonly number[]) => {
            const distance = vectorDistance(column('d', 'embedding'), embedding, metric);
            return source.execute({
                kind: 'select', from: { entity: Document, alias: 'd' },
                selections: [{ expression: column('d', 'id') }, { expression: distance, alias: 'distance' }],
                joins: [], orderBy: [{ expression: distance, direction: 'asc' }], distinct: false, limit: 2
            });
        };

        const cosine = await nearest('cosine', [1, 0]);
        expect(cosine.rows).toEqual([{ id: 2, distance: 0 }, { id: 1, distance: 1 }]);
        const euclidean = await nearest('l2', [1, 0]);
        expect(euclidean.rows.map(row => row.id)).toEqual([2, 1]);
        expect(euclidean.rows[0]?.distance).toBe(0);
        expect(euclidean.rows[1]?.distance).toBeCloseTo(Math.SQRT2);
        await expect(nearest('l2', [1, 0, 0])).rejects.toThrow('different vector dimensions');
    } finally {
        await source.close();
    }
});
