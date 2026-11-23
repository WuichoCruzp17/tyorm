import type { PoolClient } from 'pg';
import { TransactionOutcomeUnknownError } from
  '../errors/transaction-outcome-unknown.error';

import {
  isPostgreSQLConnectionError
} from '../errors/postgresql-error-classifier';



import type {
  DatabaseConnection,
  Query,
  QueryResult,
  TransactionOptions
} from '@tyorm/core';

export class PostgreSQLConnection implements DatabaseConnection {
  private released = false;
  private transactionActive = false;
  private releaseError?: Error;
  private broken = false;
  private queue = Promise.resolve();

  constructor(private readonly client: PoolClient) { }

  get isReleased(): boolean {
    return this.released;
  }



  async execute<T = Record<string, unknown>>(
    query: Query
  ): Promise<QueryResult<T>> {
    const { sql, parameters } = query;
    const values = parameters ? [...parameters] : [];

    return this.enqueue(async () => {
      this.ensureActive();

      try {
        const result = await this.client.query(sql, values);

        return {
          rows: result.rows as T[],
          affectedRows: result.rowCount,
          command: result.command
        };
      } catch (error) {
        if (isPostgreSQLConnectionError(error)) {
          this.broken = true;
          this.releaseError = this.toError(error);
        }

        throw error;
      }
    });
  }



  async beginTransaction(
    options?: TransactionOptions
  ): Promise<void> {
    const { isolationLevel, readOnly } = options ?? {};

    return this.enqueue(async () => {
      this.ensureActive();

      if (this.transactionActive) {
        throw new Error('A transaction is already active.');
      }

      const isolationSql: Record<string, string> = {
        READ_UNCOMMITTED: 'READ UNCOMMITTED',
        READ_COMMITTED: 'READ COMMITTED',
        REPEATABLE_READ: 'REPEATABLE READ',
        SERIALIZABLE: 'SERIALIZABLE'
      };

      const isolationClause = isolationLevel
        ? ` ISOLATION LEVEL ${isolationSql[isolationLevel]}`
        : '';

      if (isolationLevel && !isolationSql[isolationLevel]) {
        throw new Error(
          `Unsupported isolation level: ${isolationLevel}`
        );
      }

      const readOnlyClause = readOnly
        ? ' READ ONLY'
        : '';

      try {
        await this.client.query(
          `BEGIN${isolationClause}${readOnlyClause}`
        );

        this.transactionActive = true;
      } catch (error) {
        // No podemos garantizar el estado de la sesión.
        // La conexión no debe regresar al pool.
        this.broken = true;
        this.releaseError = this.toError(error);

        throw error;
      }
    });
  }


  async commit(): Promise<void> {
    return this.enqueue(async () => {
      this.ensureActive();

      if (!this.transactionActive) {
        throw new Error(
          'There is no active transaction to commit.'
        );
      }

      try {
        await this.client.query('COMMIT');
        this.transactionActive = false;
      } catch (error) {
        // No sabemos si PostgreSQL confirmó la transacción.
        // Por seguridad, la conexión ya no podrá utilizarse.
        this.broken = true;
        this.releaseError = this.toError(error);

        throw new TransactionOutcomeUnknownError(error);
      }
    });
  }

  rollback(): Promise<void> {
    return this.enqueue(() => this.rollbackActiveTransaction());
  }

  private async rollbackActiveTransaction(): Promise<void> {
    this.ensureActive();

    if (!this.transactionActive) {
      return;
    }

    try {
      await this.client.query('ROLLBACK');
      this.transactionActive = false;
    } catch (error) {
      this.broken = true;
      this.releaseError = this.toError(error);
      throw error;
    }
  }


  async release(): Promise<void> {
    return this.enqueue(async () => {
      if (this.released) {
        return;
      }

      let rollbackFailed = false;
      let rollbackError: unknown;

      if (this.transactionActive && !this.broken) {
        try {
          await this.rollbackActiveTransaction();
        } catch (error) {
          rollbackFailed = true;
          rollbackError = error;
        }
      }

      this.released = true;

      let releaseFailed = false;
      let releaseError: unknown;

      try {
        if (this.broken) {
          this.client.release(
            this.releaseError ??
            new Error('Database connection is unusable.')
          );
        } else {
          this.client.release();
        }
      } catch (error) {
        releaseFailed = true;
        releaseError = error;
      }

      if (rollbackFailed && releaseFailed) {
        throw new AggregateError(
          [rollbackError, releaseError],
          'ROLLBACK and connection release both failed.'
        );
      }

      if (rollbackFailed) {
        throw rollbackError;
      }

      if (releaseFailed) {
        throw releaseError;
      }
    });
  }


  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    // A rejected operation must leave the queue available for rollback and release.
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private ensureActive(): void {
    if (this.released) {
      throw new Error(
        'The database connection has already been released.'
      );
    }

    if (this.broken) {
      throw new Error(
        'The database connection is in an unusable state.'
      );
    }
  }
  private toError(error: unknown): Error {
    return error instanceof Error
      ? error
      : new Error(String(error));
  }
}
