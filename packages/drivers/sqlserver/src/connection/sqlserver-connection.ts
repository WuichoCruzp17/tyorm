import sql, { type ConnectionPool, type Transaction } from 'mssql';
import type {
    DatabaseConnection,
    IsolationLevel,
    Query,
    QueryResult,
    TransactionOptions
} from '@tyorm/core';

const isolationLevels: Readonly<Record<IsolationLevel, number>> = {
    READ_UNCOMMITTED: sql.ISOLATION_LEVEL.READ_UNCOMMITTED,
    READ_COMMITTED: sql.ISOLATION_LEVEL.READ_COMMITTED,
    REPEATABLE_READ: sql.ISOLATION_LEVEL.REPEATABLE_READ,
    SERIALIZABLE: sql.ISOLATION_LEVEL.SERIALIZABLE
};

export class SqlServerConnection implements DatabaseConnection {
    private released = false;
    private broken = false;
    private transaction: Transaction | undefined;
    private queue = Promise.resolve();

    constructor(private readonly pool: ConnectionPool) {}

    get isReleased(): boolean {
        return this.released;
    }

    execute<T>(query: Query): Promise<QueryResult<T>> {
        return this.enqueue(async () => {
            this.assertUsable();
            const request = this.transaction?.request() ?? this.pool.request();
            for (const [index, value] of (query.parameters ?? []).entries()) {
                if (value === undefined) throw new TypeError('SQL Server query parameters cannot be undefined.');
                request.input(`p${index}`, toSqlServerValue(value));
            }
            const result = await request.query<T>(query.sql);
            return {
                rows: result.recordset ? Array.from(result.recordset) : [],
                affectedRows: result.rowsAffected.length > 0
                    ? result.rowsAffected.reduce((total, count) => total + count, 0)
                    : null
            };
        });
    }

    beginTransaction(options?: TransactionOptions): Promise<void> {
        return this.enqueue(async () => {
            this.assertUsable();
            if (this.transaction) throw new Error('A SQL Server transaction is already active.');
            if (options?.readOnly === true) {
                throw new Error('SQL Server does not support read-only transactions through this driver.');
            }
            if (options?.isolationLevel !== undefined &&
                !Object.hasOwn(isolationLevels, options.isolationLevel)) {
                throw new Error('Unsupported SQL Server isolation level.');
            }
            const isolationLevel = options?.isolationLevel === undefined
                ? undefined
                : isolationLevels[options.isolationLevel];
            const transaction = new sql.Transaction(this.pool);
            try {
                await transaction.begin(isolationLevel);
                this.transaction = transaction;
            } catch (error) {
                this.broken = true;
                throw error;
            }
        });
    }

    commit(): Promise<void> {
        return this.enqueue(async () => {
            this.assertUsable();
            const transaction = this.requireTransaction('commit');
            await transaction.commit();
            this.transaction = undefined;
        });
    }

    rollback(): Promise<void> {
        return this.enqueue(() => this.rollbackActive());
    }

    release(): Promise<void> {
        return this.enqueue(async () => {
            if (this.released) return;
            try {
                await this.rollbackActive();
            } finally {
                this.released = true;
            }
        });
    }

    private async rollbackActive(): Promise<void> {
        this.assertUsable();
        const transaction = this.transaction;
        if (!transaction) return;
        try {
            await transaction.rollback();
            this.transaction = undefined;
        } catch (error) {
            this.broken = true;
            throw error;
        }
    }

    private requireTransaction(operation: string): Transaction {
        if (!this.transaction) throw new Error(`There is no active SQL Server transaction to ${operation}.`);
        return this.transaction;
    }

    private assertUsable(): void {
        if (this.released || this.broken) throw new Error('SQL Server connection is unavailable.');
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.queue.then(operation);
        this.queue = result.then(() => undefined, () => undefined);
        return result;
    }
}

function toSqlServerValue(value: unknown): string | number | boolean | bigint | Date | Buffer | null {
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean' || typeof value === 'bigint') return value;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new TypeError('SQL Server date parameter must be valid.');
        return value;
    }
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new TypeError('Unsupported SQL Server parameter value.');
}
