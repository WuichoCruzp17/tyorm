
import type { Query } from './query.interface';

import type {
    QueryResult
} from './query-result.interface';

import type {
    TransactionOptions
} from './transaction.interface';

export interface DatabaseConnection {

    /**
     * Executes a parameterized SQL statement.
     */
    execute<T = Record<string, unknown>>(
        query: Query
    ): Promise<QueryResult<T>>;

    /**
     * Starts a transaction.
     */
    beginTransaction(
        options?: TransactionOptions
    ): Promise<void>;

    /**
     * Commits the current transaction.
     */
    commit(): Promise<void>;

    /**
     * Rolls back the current transaction.
     */
    rollback(): Promise<void>;

    /**
     * Releases this connection back to its pool.
     */
    release(): Promise<void>;

    /**
     * Indicates whether this connection lease is active.
     */
    readonly isReleased: boolean;

}
