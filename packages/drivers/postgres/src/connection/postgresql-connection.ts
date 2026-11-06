import type { PoolClient } from 'pg';
import { TransactionOutcomeUnknownError } from
  '../errors/transaction-outcome-unknown.error';
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

  constructor(private readonly client: PoolClient) { }

  get isReleased(): boolean {
    return this.released;
  }

  async execute<T = Record<string, unknown>>(
    query: Query
  ): Promise<QueryResult<T>> {
    this.ensureActive();

    const result = await this.client.query(
      query.sql,
      query.parameters ? [...query.parameters] : []
    );

    return {
      rows: result.rows as T[],
      affectedRows: result.rowCount,
      command: result.command
    };
  }


  async beginTransaction(
    options?: TransactionOptions
  ): Promise<void> {
    this.ensureActive();

    if (this.transactionActive) {
      throw new Error('A transaction is already active.');
    }

    const isolationLevel = options?.isolationLevel;

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

    const readOnlyClause = options?.readOnly
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
  }


  async commit(): Promise<void> {
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
  }

  async rollback(): Promise<void> {
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
    if (this.released) {
      return;
    }

    let rollbackError: unknown;

    if (this.transactionActive && !this.broken) {
      try {
        await this.rollback();
      } catch (error) {
        rollbackError = error;
      }
    }

    this.released = true;

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
      if (rollbackError === undefined) {
        throw error;
      }
    }

    if (rollbackError !== undefined) {
      throw rollbackError;
    }
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
