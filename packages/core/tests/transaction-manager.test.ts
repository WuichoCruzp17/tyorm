
import { describe, it, expect, vi } from 'vitest';

import { TransactionManager } from '../src/transactions';
import { TransactionError } from '../src/transactions';

import type {
  DatabaseDriver,
  DatabaseConnection
} from '../src/drivers';

function createMocks() {
  const connection = {
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

  return {
    manager,
    driver,
    connection
  };
}

describe('TransactionManager', () => {

  it('should commit a successful transaction', async () => {
    const { manager, connection } = createMocks();

    const result = await manager.transaction(async () => {
      return 100;
    });

    expect(result).toBe(100);
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('should rollback when callback fails', async () => {
    const { manager, connection } = createMocks();

    await expect(
      manager.transaction(async () => {
        throw new Error('Business error');
      })
    ).rejects.toThrow('Business error');

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('should preserve original error when rollback fails', async () => {
    const { manager, connection } = createMocks();

    const businessError = new Error('Business error');
    const rollbackError = new Error('Rollback failed');

    connection.rollback.mockRejectedValueOnce(rollbackError);

    try {
      await manager.transaction(async () => {
        throw businessError;
      });

      expect.fail('Transaction should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionError);

      const transactionError = error as TransactionError;

      expect(transactionError.originalError).toBe(businessError);
      expect(transactionError.rollbackError).toBe(rollbackError);
    }

    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('should not rollback after failed commit', async () => {
    const { manager, connection } = createMocks();

    connection.commit.mockRejectedValueOnce(
      new Error('Connection lost during COMMIT')
    );

    await expect(
      manager.transaction(async () => 'done')
    ).rejects.toThrow('Connection lost during COMMIT');

    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('should release connection when beginTransaction fails', async () => {
    const { manager, connection } = createMocks();

    connection.beginTransaction.mockRejectedValueOnce(
      new Error('BEGIN failed')
    );

    await expect(
      manager.transaction(async () => 10)
    ).rejects.toThrow('BEGIN failed');

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('should preserve callback and release errors', async () => {
    const { manager, connection } = createMocks();

    const businessError = new Error('Business error');
    const releaseError = new Error('Release failed');

    connection.release.mockRejectedValueOnce(releaseError);

    try {
      await manager.transaction(async () => {
        throw businessError;
      });

      expect.fail('Transaction should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionError);

      const transactionError = error as TransactionError;

      expect(transactionError.originalError).toBe(businessError);
      expect(transactionError.releaseError).toBe(releaseError);
    }
  });

  it('should return undefined when callback has no result', async () => {
    const { manager } = createMocks();

    const result = await manager.transaction(async () => {
      // No return
    });

    expect(result).toBeUndefined();
  });

  it('should propagate acquireConnection failure', async () => {
    const { manager, driver } = createMocks();

    driver.acquireConnection.mockRejectedValueOnce(
      new Error('Pool exhausted')
    );

    await expect(
      manager.transaction(async () => 1)
    ).rejects.toThrow('Pool exhausted');
  });

});
