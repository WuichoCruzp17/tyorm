
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { TransactionManager } from '@tyorm/core';

import type {
    DatabaseDriver
} from '@tyorm/core';

import type { PoolClient } from 'pg';

import {
    PostgreSQLConnection
} from '../src/connection/postgresql-connection';

describe('TransactionManager - connection failures', () => {

    it('should discard broken connection with pending queries', async () => {
        const transportError = Object.assign(
            new Error('Connection lost'),
            { code: 'ECONNRESET' }
        );

        const query = vi.fn()
            .mockResolvedValueOnce({}) // BEGIN
            .mockRejectedValueOnce(transportError)
            .mockRejectedValueOnce(
                new Error('Connection already closed')
            );

        const release = vi.fn();

        const client = {
            query,
            release
        } as unknown as PoolClient;

        const connection = new PostgreSQLConnection(client);

        const driver = {
            acquireConnection: vi.fn().mockResolvedValue(connection)
        } as unknown as DatabaseDriver;

        const manager = new TransactionManager(driver);

        let caught: unknown;

        try {
            await manager.withContext(async (context) => {
                await Promise.allSettled([
                    context.execute({ sql: 'SELECT 1' }),
                    context.execute({ sql: 'SELECT 2' })
                ]);
            });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeDefined();

        // BEGIN + las consultas que llegaron al cliente.
        // Nunca se envía COMMIT ni ROLLBACK.
        const sqlStatements = query.mock.calls.map(
            (call) => call[0]
        );

        expect(sqlStatements).toContain('BEGIN');
        expect(sqlStatements).not.toContain('COMMIT');
        expect(sqlStatements).not.toContain('ROLLBACK');

        expect(connection.isReleased).toBe(true);

        expect(release).toHaveBeenCalledWith(
            transportError
        );
    });
});
