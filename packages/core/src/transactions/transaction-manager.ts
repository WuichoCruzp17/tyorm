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

    let transactionStarted = false;
    let result: T | undefined;
    let failure: unknown;
    let hasFailure = false;
    let rollbackError: unknown;
    let releaseError: unknown;

    try {
      await connection.beginTransaction(options);
      transactionStarted = true;

      result = await callback(connection);

      // Si COMMIT falla, no intentamos un segundo COMMIT.
      // Tampoco asumimos que la transacción fue revertida.
      transactionStarted = false;
      await connection.commit();
    } catch (error) {
      failure = error;
      hasFailure = true;

      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (error) {
          rollbackError = error;
        }
      }
    } finally {
      try {
        await connection.release();
      } catch (error) {
        releaseError = error;
      }
    }

    if (hasFailure) {
      if (rollbackError !== undefined || releaseError !== undefined) {
        throw new TransactionError(
          'Transaction failed and cleanup encountered errors.',
          failure,
          rollbackError,
          releaseError
        );
      }

      throw failure;
    }

    if (releaseError !== undefined) {
      throw new TransactionError(
        'Transaction completed, but releasing the connection failed.',
        releaseError
      );
    }

    return result as T;
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
        // No se admiten nuevas operaciones.
        context.close();
      }

      let drainError: unknown;

      try {
        // Esperar las consultas antes de COMMIT/ROLLBACK.
        await context.drain();
      } catch (error) {
        drainError = error;
      }

      if (callbackFailed && drainError !== undefined) {
        throw new AggregateError(
          [callbackError, drainError],
          'Transaction callback and pending operations failed.'
        );
      }

      if (callbackFailed) {
        throw callbackError;
      }

      if (drainError !== undefined) {
        throw drainError;
      }

      return result;
    }, options);
  }


}
