import { expect, it } from 'vitest';
import { DataSource } from '@tyorm/core';
import { postgresProvider } from '../src';

it('returns rows from functions and procedures and rolls back their writes', async () => {
    const { driver, compiler } = await postgresProvider();
    const password = process.env.PGPASSWORD;
    const source = await DataSource.connect({
        type: 'postgres',
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? 'tyorm_test',
        username: process.env.PGUSER ?? 'postgres',
        ...(password === undefined ? {} : { password }),
        pool: { min: 1, max: 1 },
        entities: [],
        providers: { postgres: () => ({ driver, compiler }) }
    });

    try {
        const connection = await driver.acquireConnection();
        try {
            await connection.execute({ sql: 'CREATE TEMP TABLE function_entries (label TEXT NOT NULL)' });
            await connection.execute({
                sql: `
                    CREATE FUNCTION pg_temp.add_function_entry(text) RETURNS TABLE (label text)
                    LANGUAGE SQL AS $$
                        INSERT INTO function_entries AS entry (label)
                        VALUES ($1) RETURNING entry.label
                    $$
                `
            });
            await connection.execute({
                sql: `
                    CREATE PROCEDURE pg_temp.add_procedure_entry(IN input text, OUT stored text, OUT label_size integer)
                    LANGUAGE plpgsql AS $$
                    BEGIN
                        INSERT INTO function_entries (label) VALUES (input);
                        stored := input;
                        label_size := length(input);
                    END;
                    $$
                `
            });
        } finally {
            await connection.release();
        }

        const call = { schema: 'pg_temp', name: 'add_function_entry', args: ["O'Brien"] };
        await expect(source.executeFunction(call)).resolves.toMatchObject({ rows: [{ label: "O'Brien" }] });

        const procedure = (label: string) => ({
            schema: 'pg_temp', name: 'add_procedure_entry',
            args: [label, { mode: 'out' }, { mode: 'out' }] as const
        });
        await expect(source.executeProcedure(procedure('procedure commit')))
            .resolves.toMatchObject({ rows: [{ stored: 'procedure commit', label_size: 16 }] });

        const abort = new Error('Abort function transaction');
        await expect(source.transaction(async scope => {
            await expect(scope.executeFunction({ ...call, args: ['rolled back'] }))
                .resolves.toMatchObject({ rows: [{ label: 'rolled back' }] });
            await expect(scope.executeProcedure(procedure('procedure rollback')))
                .resolves.toMatchObject({ rows: [{ stored: 'procedure rollback', label_size: 18 }] });
            throw abort;
        })).rejects.toBe(abort);

        const verifier = await driver.acquireConnection();
        try {
            const { rows } = await verifier.execute({ sql: 'SELECT label FROM function_entries ORDER BY label' });
            expect(rows).toEqual([{ label: "O'Brien" }, { label: 'procedure commit' }]);
        } finally {
            await verifier.release();
        }
    } finally {
        await source.close();
    }
});
