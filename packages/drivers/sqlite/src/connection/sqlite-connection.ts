import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { DatabaseConnection, Query, QueryResult, TransactionOptions } from '@tyorm/core';

export class SQLiteConnection implements DatabaseConnection {
    private released = false;

    constructor(
        private readonly database: DatabaseSync,
        private readonly unlock: () => void,
        private readonly markRollbackFailed: () => void
    ) {}

    get isReleased(): boolean {
        return this.released;
    }

    async execute<T>(query: Query): Promise<QueryResult<T>> {
        this.assertActive();
        const statement = this.database.prepare(query.sql);
        const parameters = (query.parameters ?? []).map(toSqliteValue);
        if (statement.columns().length > 0) {
            statement.setReadBigInts(true);
            const rows = statement.all(...parameters).map(row => Object.fromEntries(
                Object.entries(row).map(([key, value]) => [key, normalizeInteger(value)])
            ));
            const affectedRows = /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(query.sql) ? rows.length : null;
            return { rows: rows as T[], affectedRows };
        }
        const { changes } = statement.run(...parameters);
        return { rows: [], affectedRows: Number(changes) };
    }

    async beginTransaction(options?: TransactionOptions): Promise<void> {
        this.assertActive();
        if (options?.readOnly || (options?.isolationLevel && options.isolationLevel !== 'SERIALIZABLE')) {
            throw new Error('SQLite supports default or SERIALIZABLE read-write transactions.');
        }
        this.database.exec('BEGIN');
    }

    async commit(): Promise<void> {
        this.assertActive();
        this.database.exec('COMMIT');
    }

    async rollback(): Promise<void> {
        this.assertActive();
        this.database.exec('ROLLBACK');
    }

    async release(): Promise<void> {
        if (this.released) return;
        this.released = true;
        try {
            if (this.database.isTransaction) this.database.exec('ROLLBACK');
        } catch (error) {
            this.markRollbackFailed();
            throw error;
        } finally {
            this.unlock();
        }
    }

    private assertActive(): void {
        if (this.released) throw new Error('SQLite connection has been released.');
    }
}

function normalizeInteger(value: unknown): unknown {
    if (typeof value === 'bigint' && Number.isSafeInteger(Number(value))) return Number(value);
    return value;
}

function toSqliteValue(value: unknown): SQLInputValue {
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'bigint' || value instanceof Uint8Array) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    throw new TypeError('Unsupported SQLite parameter value.');
}
