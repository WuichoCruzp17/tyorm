
import { describe, it, expect, vi } from 'vitest';

import {
    ManagedTransactionContext
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

});
