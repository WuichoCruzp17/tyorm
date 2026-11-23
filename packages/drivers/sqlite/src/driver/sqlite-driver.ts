import { DatabaseSync } from 'node:sqlite';
import type { DatabaseConnection, DatabaseDriver, DriverConfig } from '@tyorm/core';
import { SQLiteConnection } from '../connection/sqlite-connection';

export class SQLiteDriver implements DatabaseDriver {
    readonly name = 'sqlite';
    private database: DatabaseSync | undefined;
    private tail = Promise.resolve();
    private closing: Promise<void> | undefined;
    private rollbackFailed = false;

    async connect(config: DriverConfig): Promise<void> {
        if (this.database || this.closing) throw new Error('SQLite driver is already connected or closing.');
        if (config.type !== this.name) throw new Error('SQLite driver requires type "sqlite".');
        this.database = new DatabaseSync(config.database);
        this.rollbackFailed = false;
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        const database = this.database;
        if (!database || this.closing) throw new Error('SQLite driver is disconnected or closing.');

        // A single lease protects the transaction and keeps :memory: shared between queries.
        const previous = this.tail;
        let next!: () => void;
        this.tail = new Promise<void>(resolve => { next = resolve; });
        await previous;
        if (this.rollbackFailed) {
            next();
            throw new Error('SQLite connection is unavailable after a rollback failure.');
        }
        return new SQLiteConnection(database, next, () => { this.rollbackFailed = true; });
    }

    async ping(): Promise<boolean> {
        if (!this.database || this.closing || this.rollbackFailed) return false;
        const connection = await this.acquireConnection();
        try {
            await connection.execute({ sql: 'SELECT 1' });
            return true;
        } finally {
            await connection.release();
        }
    }

    disconnect(): Promise<void> {
        const database = this.database;
        if (!database) return Promise.resolve();
        this.closing ??= this.tail.then(() => {
            database.close();
            this.database = undefined;
        }).finally(() => { this.closing = undefined; });
        return this.closing;
    }
}
