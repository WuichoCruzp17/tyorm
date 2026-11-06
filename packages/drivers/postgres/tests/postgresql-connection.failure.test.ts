
import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';

import { PostgreSQLConnection } from
  '../src/connection/postgresql-connection';

import { TransactionOutcomeUnknownError } from
  '../src/errors/transaction-outcome-unknown.error';

function createMockClient() {
  const query = vi.fn();
  const release = vi.fn();

  const client = {
    query,
    release
  } as unknown as PoolClient;

  return { client, query, release };
}

describe('PostgreSQLConnection - Transaction failures', () => {

  it('should discard connection when COMMIT fails', async () => {
    const mock = createMockClient();
    const networkError = new Error('Connection lost');

    mock.query.mockResolvedValueOnce({ command: 'BEGIN' });
    mock.query.mockRejectedValueOnce(networkError);

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    await expect(
      connection.commit()
    ).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);

    await connection.release();

    expect(connection.isReleased).toBe(true);
    expect(mock.release).toHaveBeenCalledWith(networkError);
    expect(mock.query).toHaveBeenCalledTimes(2);
  });

  it('should prevent queries after failed COMMIT', async () => {
    const mock = createMockClient();

    mock.query.mockResolvedValueOnce({ command: 'BEGIN' });
    mock.query.mockRejectedValueOnce(new Error('Connection lost'));

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    await expect(connection.commit()).rejects.toThrow(
      TransactionOutcomeUnknownError
    );

    await expect(
      connection.execute({ sql: 'SELECT 1' })
    ).rejects.toThrow('unusable state');

    await connection.release();
  });

  it('should prevent retrying COMMIT after failure', async () => {
    const mock = createMockClient();

    mock.query.mockResolvedValueOnce({ command: 'BEGIN' });
    mock.query.mockRejectedValueOnce(new Error('Connection lost'));

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    await expect(connection.commit()).rejects.toThrow(
      TransactionOutcomeUnknownError
    );

    await expect(connection.commit()).rejects.toThrow(
      'unusable state'
    );

    expect(mock.query).toHaveBeenCalledTimes(2);

    await connection.release();
  });

  it('should discard connection when ROLLBACK fails', async () => {
    const mock = createMockClient();
    const rollbackError = new Error('Rollback failed');

    mock.query.mockResolvedValueOnce({ command: 'BEGIN' });
    mock.query.mockRejectedValueOnce(rollbackError);

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    await expect(
      connection.rollback()
    ).rejects.toThrow('Rollback failed');

    await connection.release();

    expect(mock.release).toHaveBeenCalledWith(rollbackError);
  });

  it('should rollback an open transaction before release', async () => {
    const mock = createMockClient();

    mock.query.mockResolvedValueOnce({ command: 'BEGIN' });
    mock.query.mockResolvedValueOnce({ command: 'ROLLBACK' });

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();
    await connection.release();

    expect(mock.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(mock.release).toHaveBeenCalledWith();
    expect(connection.isReleased).toBe(true);
  });

  it('should discard connection if rollback during release fails', async () => {
    const mock = createMockClient();
    const rollbackError = new Error('Network disconnected');

    mock.query.mockResolvedValueOnce({ command: 'BEGIN' });
    mock.query.mockRejectedValueOnce(rollbackError);

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    await expect(
      connection.release()
    ).rejects.toThrow('Network disconnected');

    expect(connection.isReleased).toBe(true);
    expect(mock.release).toHaveBeenCalledWith(rollbackError);
  });

  it('should not release the same client twice', async () => {
    const mock = createMockClient();
    const connection = new PostgreSQLConnection(mock.client);

    await connection.release();
    await connection.release();

    expect(mock.release).toHaveBeenCalledTimes(1);
  });
  it('should discard connection when BEGIN fails', async () => {
    const mock = createMockClient();
    const beginError = new Error('Connection lost during BEGIN');

    mock.query.mockRejectedValueOnce(beginError);

    const connection = new PostgreSQLConnection(mock.client);

    await expect(
      connection.beginTransaction()
    ).rejects.toThrow('Connection lost during BEGIN');

    await connection.release();

    expect(connection.isReleased).toBe(true);
    expect(mock.release).toHaveBeenCalledWith(beginError);
    expect(mock.query).toHaveBeenCalledTimes(1);
  });

  it('should discard connection after transport error', async () => {
    const mock = createMockClient();

    const transportError = Object.assign(
      new Error('Connection reset'),
      { code: 'ECONNRESET' }
    );

    mock.query.mockRejectedValueOnce(transportError);

    const connection = new PostgreSQLConnection(mock.client);

    await expect(
      connection.execute({ sql: 'SELECT 1' })
    ).rejects.toThrow('Connection reset');

    await expect(
      connection.execute({ sql: 'SELECT 2' })
    ).rejects.toThrow('unusable state');

    await connection.release();

    expect(mock.release).toHaveBeenCalledWith(
      transportError
    );
  });

  it('should allow rollback after SQL error', async () => {
    const mock = createMockClient();

    const sqlError = Object.assign(
      new Error('Division by zero'),
      { code: '22012' }
    );

    mock.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(sqlError) // SELECT
      .mockResolvedValueOnce({}); // ROLLBACK

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    await expect(
      connection.execute({ sql: 'SELECT 1 / 0' })
    ).rejects.toThrow('Division by zero');

    await connection.rollback();
    await connection.release();

    expect(mock.release).toHaveBeenCalledWith();
  });

});
