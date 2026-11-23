
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


  it('should preserve rollback and release errors', async () => {
    const mock = createMockClient();

    const rollbackError = new Error('ROLLBACK failed');
    const releaseError = new Error('Release failed');

    mock.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(rollbackError); // ROLLBACK

    mock.release.mockImplementationOnce(() => {
      throw releaseError;
    });

    const connection = new PostgreSQLConnection(mock.client);

    await connection.beginTransaction();

    let caught: unknown;

    try {
      await connection.release();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);

    const aggregate = caught as AggregateError;

    expect(aggregate.errors).toEqual([
      rollbackError,
      releaseError
    ]);

    expect(connection.isReleased).toBe(true);
    expect(mock.release).toHaveBeenCalledWith(rollbackError);
  });

  it('should propagate release failure', async () => {
    const mock = createMockClient();

    const releaseError = new Error('Pool release failed');

    mock.release.mockImplementationOnce(() => {
      throw releaseError;
    });

    const connection = new PostgreSQLConnection(mock.client);

    await expect(
      connection.release()
    ).rejects.toBe(releaseError);

    expect(connection.isReleased).toBe(true);
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('should not retry release after failure', async () => {
    const mock = createMockClient();

    mock.release.mockImplementationOnce(() => {
      throw new Error('Release failed');
    });

    const connection = new PostgreSQLConnection(mock.client);

    await expect(connection.release()).rejects.toThrow(
      'Release failed'
    );

    await expect(connection.release()).resolves.toBeUndefined();

    expect(mock.release).toHaveBeenCalledOnce();
  });

});

it('serializes pending queries, commit and release on one pg client', async () => {
  const { client, query, release } = createMockClient();
  const connection = new PostgreSQLConnection(client);
  const result = { rows: [], rowCount: 0, command: 'SELECT' };
  let finishFirst!: () => void;
  query.mockResolvedValue(result).mockResolvedValueOnce({ command: 'BEGIN' })
    .mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }).then(() => result));

  await connection.beginTransaction();
  const first = connection.execute({ sql: 'SELECT 1' });
  const second = connection.execute({ sql: 'SELECT 2' });
  const commit = connection.commit();
  const released = connection.release();
  const afterRelease = expect(connection.execute({ sql: 'SELECT 3' })).rejects.toThrow('already been released');

  await Promise.resolve();
  expect(query.mock.calls).toEqual([['BEGIN'], ['SELECT 1', []]]);
  expect(release).not.toHaveBeenCalled();

  finishFirst();
  await Promise.all([first, second, commit, released, afterRelease]);
  expect(query.mock.calls).toEqual([['BEGIN'], ['SELECT 1', []], ['SELECT 2', []], ['COMMIT']]);
  expect(release).toHaveBeenCalledOnce();
});
