
import { describe, it, expect, vi } from 'vitest';

import {
    ManagedTransactionContext,
    TransactionContext
} from '../src/transactions/transaction-context';

import { TransactionManager } from
    '../src/transactions/transaction-manager';

import type {
    DatabaseConnection,
    DatabaseDriver
} from '../src/drivers';

function createMocks() {
    const connection = {
        execute: vi.fn().mockResolvedValue({
            rows: [{ value: 1 }],
            affectedRows: 1,
            command: 'SELECT'
        }),
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        release: vi.fn().mockResolvedValue(undefined)
    };

    const driver = {
        acquireConnection: vi.fn().mockResolvedValue(connection)
    };

    const manager = new TransactionManager(
        driver as unknown as DatabaseDriver
    );

    return { connection, driver, manager };
}

describe('TransactionContext', () => {

    it('should execute queries using the assigned connection', async () => {
        const { connection } = createMocks();

        const context = new ManagedTransactionContext(
            connection as unknown as DatabaseConnection
        );

        const result = await context.execute<{ value: number }>({
            sql: 'SELECT $1 AS value',
            parameters: [1]
        });

        expect(result.rows[0]?.value).toBe(1);
        expect(connection.execute).toHaveBeenCalledWith({
            sql: 'SELECT $1 AS value',
            parameters: [1]
        });
    });

    it('should reject queries after context is closed', async () => {
        const { connection } = createMocks();

        const context = new ManagedTransactionContext(
            connection as unknown as DatabaseConnection
        );

        context.close();

        expect(context.isActive).toBe(false);

        await expect(
            context.execute({ sql: 'SELECT 1' })
        ).rejects.toThrow('no longer active');

        expect(connection.execute).not.toHaveBeenCalled();
    });

    it('should share one connection across multiple operations', async () => {
        const { manager, driver, connection } = createMocks();

        await manager.withContext(async (context) => {
            await context.execute({ sql: 'SELECT 1' });
            await context.execute({ sql: 'SELECT 2' });
        });

        expect(driver.acquireConnection).toHaveBeenCalledOnce();
        expect(connection.execute).toHaveBeenCalledTimes(2);
        expect(connection.commit).toHaveBeenCalledOnce();
        expect(connection.release).toHaveBeenCalledOnce();
    });

    it('should close context after successful transaction', async () => {
        const { manager } = createMocks();

        let savedContext:
            Parameters<Parameters<typeof manager.withContext>[0]>[0]
            | undefined;

        await manager.withContext(async (context) => {
            savedContext = context;
            expect(context.isActive).toBe(true);
        });

        expect(savedContext?.isActive).toBe(false);

        await expect(
            savedContext!.execute({ sql: 'SELECT 1' })
        ).rejects.toThrow('no longer active');
    });

    it('should close context when callback fails', async () => {
        const { manager, connection } = createMocks();

        let savedContext:
            Parameters<Parameters<typeof manager.withContext>[0]>[0]
            | undefined;

        await expect(
            manager.withContext(async (context) => {
                savedContext = context;
                throw new Error('Business failure');
            })
        ).rejects.toThrow('Business failure');

        expect(savedContext?.isActive).toBe(false);
        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.release).toHaveBeenCalledOnce();
    });

    it('should return callback result', async () => {
        const { manager } = createMocks();

        const result = await manager.withContext(async (context) => {
            await context.execute({ sql: 'SELECT 1' });
            return { success: true, count: 10 };
        });

        expect(result).toEqual({
            success: true,
            count: 10
        });
    });

    it('should close context when COMMIT fails', async () => {
        const { manager, connection } = createMocks();

        connection.commit.mockRejectedValueOnce(
            new Error('Connection lost during COMMIT')
        );

        let savedContext:
            Parameters<Parameters<typeof manager.withContext>[0]>[0]
            | undefined;

        await expect(
            manager.withContext(async (context) => {
                savedContext = context;
            })
        ).rejects.toThrow('Connection lost during COMMIT');

        expect(savedContext?.isActive).toBe(false);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledOnce();
    });


    // Agregar dentro de describe('TransactionContext', ...)

    it('should wait for pending queries before COMMIT', async () => {
        const { manager, connection } = createMocks();

        let finishQuery!: () => void;

        const pendingQuery = new Promise<void>((resolve) => {
            finishQuery = resolve;
        });

        connection.execute.mockImplementationOnce(async () => {
            await pendingQuery;

            return {
                rows: [],
                affectedRows: 1,
                command: 'INSERT'
            };
        });

        const transaction = manager.withContext(async (context) => {
            void context.execute({ sql: 'INSERT INTO test VALUES (1)' });
        });

        // Permite que la operación llegue al mock.
        await vi.waitFor(() => {
            expect(connection.execute).toHaveBeenCalledOnce();
        });

        expect(connection.commit).not.toHaveBeenCalled();

        finishQuery();

        await transaction;

        expect(connection.commit).toHaveBeenCalledOnce();
        expect(connection.release).toHaveBeenCalledOnce();
    });

    it('should rollback when an unawaited query fails', async () => {
        const { manager, connection } = createMocks();

        connection.execute.mockRejectedValueOnce(
            new Error('INSERT failed')
        );

        await expect(
            manager.withContext(async (context) => {
                void context.execute({ sql: 'INSERT INTO test VALUES (1)' });
            })
        ).rejects.toThrow('One or more transaction operations failed.');

        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.release).toHaveBeenCalledOnce();
    });

    it('should reject new queries after callback finishes', async () => {
        const { manager } = createMocks();

        let savedContext!: import(
            '../src/transactions/transaction-context'
        ).TransactionContext;

        await manager.withContext(async (context) => {
            savedContext = context;
        });

        expect(savedContext.isActive).toBe(false);

        await expect(
            savedContext.execute({ sql: 'SELECT 1' })
        ).rejects.toThrow('no longer active');
    });

    it('should preserve callback and pending query errors', async () => {
        const { manager, connection } = createMocks();

        const queryError = new Error('Database failure');
        const businessError = new Error('Business failure');

        connection.execute.mockRejectedValueOnce(queryError);

        let caught: unknown;

        try {
            await manager.withContext(async (context) => {
                void context.execute({ sql: 'INSERT INTO test VALUES (1)' });
                throw businessError;
            });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(AggregateError);

        const combined = caught as AggregateError;

        expect(combined.errors[0]).toBe(businessError);
        expect(combined.errors[1]).toBeInstanceOf(AggregateError);

        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it('should wait for all pending operations', async () => {
        const { manager, connection } = createMocks();

        let finishFirst!: () => void;
        let finishSecond!: () => void;

        const first = new Promise<void>((resolve) => {
            finishFirst = resolve;
        });

        const second = new Promise<void>((resolve) => {
            finishSecond = resolve;
        });

        connection.execute
            .mockImplementationOnce(async () => {
                await first;
                return { rows: [], affectedRows: 1, command: 'INSERT' };
            })
            .mockImplementationOnce(async () => {
                await second;
                return { rows: [], affectedRows: 1, command: 'INSERT' };
            });

        const transaction = manager.withContext(async (context) => {
            void context.execute({ sql: 'INSERT 1' });
            void context.execute({ sql: 'INSERT 2' });
        });

        await vi.waitFor(() => {
            expect(connection.execute).toHaveBeenCalledTimes(2);
        });

        finishFirst();

        await vi.waitFor(() => {
            expect(connection.execute).toHaveBeenCalledTimes(2);
        });

        expect(connection.commit).not.toHaveBeenCalled();

        finishSecond();

        await transaction;

        expect(connection.commit).toHaveBeenCalledOnce();
    });


    // Agregar dentro de describe('TransactionContext', ...)

    it('should transition through lifecycle states', async () => {
        const { connection } = createMocks();

        const context = new ManagedTransactionContext(
            connection as unknown as DatabaseConnection
        );

        expect(context.state).toBe('ACTIVE');
        expect(context.isActive).toBe(true);

        context.close();

        expect(context.state).toBe('DRAINING');
        expect(context.isActive).toBe(false);

        await context.drain();

        expect(context.state).toBe('CLOSED');
        expect(context.pendingCount).toBe(0);
    });

    it('should wait for Promise.all operations', async () => {
        const { manager, connection } = createMocks();

        const events: string[] = [];

        connection.execute.mockImplementation(async () => {
            events.push('query');
            return {
                rows: [],
                affectedRows: 1,
                command: 'SELECT'
            };
        });

        connection.commit.mockImplementation(async () => {
            events.push('commit');
        });

        await manager.withContext(async (context) => {
            await Promise.all([
                context.execute({ sql: 'SELECT 1' }),
                context.execute({ sql: 'SELECT 2' }),
                context.execute({ sql: 'SELECT 3' })
            ]);
        });

        expect(connection.execute).toHaveBeenCalledTimes(3);
        expect(events).toEqual([
            'query',
            'query',
            'query',
            'commit'
        ]);
    });

    it('should collect simultaneous query failures', async () => {
        const { manager, connection } = createMocks();

        const firstError = new Error('First query failed');
        const secondError = new Error('Second query failed');

        connection.execute
            .mockRejectedValueOnce(firstError)
            .mockRejectedValueOnce(secondError);

        let caught: unknown;

        try {
            await manager.withContext(async (context) => {
                // allSettled observa ambos rechazos sin perderlos.
                await Promise.allSettled([
                    context.execute({ sql: 'SELECT first' }),
                    context.execute({ sql: 'SELECT second' })
                ]);
            });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(AggregateError);

        const aggregate = caught as AggregateError;

        expect(aggregate.errors).toContain(firstError);
        expect(aggregate.errors).toContain(secondError);

        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it('should drain a query after callback finishes', async () => {
        const { manager, connection } = createMocks();

        let resolveQuery!: (value: {
            rows: unknown[];
            affectedRows: number;
            command: string;
        }) => void;

        const pendingQuery = new Promise<{
            rows: unknown[];
            affectedRows: number;
            command: string;
        }>((resolve) => {
            resolveQuery = resolve;
        });

        connection.execute.mockImplementationOnce(
            () => pendingQuery
        );

        let savedContext!: TransactionContext;

        const transaction = manager.withContext(async (context) => {
            savedContext = context;
            void context.execute({ sql: 'SELECT 1' });
        });

        await vi.waitFor(() => {
            expect(connection.execute).toHaveBeenCalledOnce();
        });

        expect(savedContext.isActive).toBe(false);
        expect(connection.commit).not.toHaveBeenCalled();

        resolveQuery({
            rows: [{ value: 1 }],
            affectedRows: 1,
            command: 'SELECT'
        });

        await transaction;

        expect(connection.commit).toHaveBeenCalledOnce();
        expect(connection.release).toHaveBeenCalledOnce();
    });

    it('should make drain idempotent', async () => {
        const { connection } = createMocks();

        const context = new ManagedTransactionContext(
            connection as unknown as DatabaseConnection
        );

        const firstDrain = context.drain();
        const secondDrain = context.drain();

        expect(firstDrain).toBe(secondDrain);

        await firstDrain;

        expect(context.state).toBe('CLOSED');

        await expect(
            context.execute({ sql: 'SELECT 1' })
        ).rejects.toThrow('no longer active');
    });

});
