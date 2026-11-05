import type {
  DatabaseDriver,
  DatabaseConnection,
  TransactionOptions
} from '../drivers';

import { TransactionError } from './transaction-error';

export class TransactionManager {
  constructor(
    private readonly driver: DatabaseDriver
  ) {}

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
}
