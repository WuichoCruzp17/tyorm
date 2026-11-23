import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnection, Query, QueryResult, TransactionOptions } from '@tyorm/core';

import { MySQLMutation } from '../query/compiler/mysql-select-compiler';

const isolation = {
    READ_UNCOMMITTED: 'READ UNCOMMITTED',
    READ_COMMITTED: 'READ COMMITTED',
    REPEATABLE_READ: 'REPEATABLE READ',
    SERIALIZABLE: 'SERIALIZABLE'
} as const;

export class MySQLConnection implements DatabaseConnection {
    private released = false;
    private active = false;
    private broken = false;
    private queue = Promise.resolve();

    constructor(private readonly client: PoolConnection) {}

    get isReleased(): boolean { return this.released; }

    execute<T>(query: Query): Promise<QueryResult<T>> {
        return this.enqueue(async () => {
            this.assertUsable();
            return query instanceof MySQLMutation ? this.executeMutation<T>(query) : this.executeStatement<T>(query);
        });
    }

    private async executeStatement<T>({ sql, parameters }: Query): Promise<QueryResult<T>> {
        const [result] = await this.client.execute<RowDataPacket[] | ResultSetHeader>(
            sql, (parameters ?? []).map(toMySQLValue)
        );
        return Array.isArray(result)
            ? { rows: result as T[], affectedRows: null }
            : { rows: [], affectedRows: result.affectedRows };
    }

    private async executeMutation<T>(plan: MySQLMutation): Promise<QueryResult<T>> {
        if (this.active) return this.runMutation<T>(plan);

        try {
            await this.client.beginTransaction();
        } catch (error) {
            this.broken = true;
            throw error;
        }
        this.active = true;

        let result: QueryResult<T>;
        try {
            result = await this.runMutation<T>(plan);
        } catch (error) {
            try {
                await this.rollbackActive();
            } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], 'MySQL mutation and rollback failed.');
            }
            throw error;
        }

        await this.commitActive();
        return result;
    }

    private async runMutation<T>(plan: MySQLMutation): Promise<QueryResult<T>> {
        const read = () => this.executeStatement<T>(plan.read);
        if (plan.kind === 'delete' || plan.kind === 'update') {
            const before = await read();
            if (before.rows.length === 0) return { rows: [], affectedRows: 0 };
            await this.executeStatement(plan);
            if (plan.kind === 'delete') return { rows: before.rows, affectedRows: before.rows.length };
        } else {
            try {
                await this.executeStatement(plan);
            } catch (error) {
                if (plan.kind !== 'upsert' || !(error instanceof Error) ||
                    !('code' in error) || error.code !== 'ER_DUP_ENTRY') {
                    throw error;
                }
                // MySQL can report a duplicate on any unique key. Only update the intended primary key.
                const existing = await read();
                if (existing.rows.length === 0) throw error;
                if (!plan.updateOnConflict) return { rows: existing.rows, affectedRows: existing.rows.length };
                await this.executeStatement(plan.updateOnConflict);
            }
        }

        const { rows } = await read();
        if (rows.length !== 1) throw new Error('MySQL mutation could not recover its row by primary key.');
        return { rows, affectedRows: rows.length };
    }

    beginTransaction(options?: TransactionOptions): Promise<void> {
        const { isolationLevel, readOnly } = options ?? {};
        return this.enqueue(async () => {
            this.assertUsable();
            if (this.active) throw new Error('A transaction is already active.');
            if (isolationLevel !== undefined && !Object.hasOwn(isolation, isolationLevel)) {
                throw new Error('Unsupported MySQL isolation level.');
            }
            try {
                if (isolationLevel !== undefined) {
                    await this.client.query(`SET TRANSACTION ISOLATION LEVEL ${isolation[isolationLevel]}`);
                }
                await this.client.query(readOnly === true ? 'START TRANSACTION READ ONLY' : 'START TRANSACTION');
                this.active = true;
            } catch (error) {
                this.broken = true;
                throw error;
            }
        });
    }

    commit(): Promise<void> {
        return this.enqueue(() => this.commitActive());
    }

    private async commitActive(): Promise<void> {
        this.assertUsable();
        if (!this.active) throw new Error('There is no active transaction to commit.');
        try {
            await this.client.commit();
            this.active = false;
        } catch (error) {
            this.broken = true;
            throw error;
        }
    }

    rollback(): Promise<void> {
        return this.enqueue(() => this.rollbackActive());
    }

    release(): Promise<void> {
        return this.enqueue(async () => {
            if (this.released) return;
            try {
                if (!this.broken) await this.rollbackActive();
            } finally {
                this.released = true;
                if (this.broken) this.client.destroy();
                else this.client.release();
            }
        });
    }

    private async rollbackActive(): Promise<void> {
        this.assertUsable();
        if (!this.active) return;
        try {
            await this.client.rollback();
            this.active = false;
        } catch (error) {
            this.broken = true;
            throw error;
        }
    }

    private assertUsable(): void {
        if (this.released || this.broken) throw new Error('MySQL connection is unavailable.');
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.queue.then(operation);
        this.queue = result.then(() => undefined, () => undefined);
        return result;
    }
}

function toMySQLValue(value: unknown): string | number | boolean | Date | Buffer | null {
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean' || value instanceof Date) return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new TypeError('Unsupported MySQL parameter value.');
}
