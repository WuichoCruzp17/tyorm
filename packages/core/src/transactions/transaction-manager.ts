import type {
  DatabaseDriver,
  DatabaseConnection,
  TransactionOptions
} from '../drivers';

import {
  ManagedTransactionContext,
  type TransactionContext
} from './transaction-context';

import { TransactionError } from './transaction-error';

export class TransactionManager {
  constructor(
    private readonly driver: DatabaseDriver
  ) { }


  async transaction<T>(
    callback: (connection: DatabaseConnection) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const connection = await this.driver.acquireConnection();

    type TransactionState =
      | 'NOT_STARTED'
      | 'ACTIVE'
      | 'COMMIT_ATTEMPTED';

    let state: TransactionState = 'NOT_STARTED';

    let result!: T;

    let hasFailure = false;
    let failure: unknown;

    let hasRollbackError = false;
    let rollbackError: unknown;

    let hasReleaseError = false;
    let releaseError: unknown;

    try {
      await connection.beginTransaction(options);
      state = 'ACTIVE';

      result = await callback(connection);

      // Una vez que intentamos COMMIT,
      // no podemos asumir que la transacción
      // sigue activa ni que fue revertida.
      state = 'COMMIT_ATTEMPTED';

      await connection.commit();

    } catch (error) {
      hasFailure = true;
      failure = error;

      // Solo hacemos rollback cuando el fallo
      // ocurrió antes de intentar COMMIT.
      if (state === 'ACTIVE') {
        try {
          await connection.rollback();
        } catch (error) {
          hasRollbackError = true;
          rollbackError = error;
        }
      }

    } finally {
      try {
        await connection.release();
      } catch (error) {
        hasReleaseError = true;
        releaseError = error;
      }
    }

    if (hasFailure) {
      if (hasRollbackError || hasReleaseError) {
        throw new TransactionError(
          'Transaction failed and cleanup encountered errors.',
          failure,
          rollbackError,
          releaseError
        );
      }

      throw failure;
    }

    if (hasReleaseError) {
      throw new TransactionError(
        'Transaction completed, but releasing the connection failed.',
        releaseError
      );
    }

    return result;
  }





  async withContext<T>(
    callback: (context: TransactionContext) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    return this.transaction(async (connection) => {
      const context = new ManagedTransactionContext(connection);

      let result!: T;
      let callbackError: unknown;
      let callbackFailed = false;

      try {
        result = await callback(context);
      } catch (error) {
        callbackFailed = true;
        callbackError = error;
      } finally {
        // Bloquea nuevas operaciones inmediatamente.
        context.close();
      }

      let drainError: unknown;
      let drainFailed = false;

      try {
        await context.drain();
      } catch (error) {
        drainFailed = true;
        drainError = error;
      }

      if (callbackFailed && drainFailed) {
        throw new AggregateError(
          [callbackError, drainError],
          'Transaction callback and pending operations failed.'
        );
      }

      if (callbackFailed) {
        throw callbackError;
      }

      if (drainFailed) {
        throw drainError;
      }

      return result;
    }, options);
  }




}
