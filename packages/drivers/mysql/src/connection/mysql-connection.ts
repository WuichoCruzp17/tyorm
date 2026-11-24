import { randomUUID } from 'node:crypto';
import type { PoolConnection, ProcedureCallPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnection, Query, QueryResult, TransactionOptions } from '@tyorm/core';

import { MySQLMutation, qualifiedTable } from '../query/compiler/mysql-select-compiler';

export type MySQLProcedureInput = string | number | boolean | bigint | Date | Uint8Array | null;

export type MySQLProcedureParameter =
    | { readonly mode: 'in'; readonly value: unknown }
    | { readonly mode: 'out' }
    | { readonly mode: 'inout'; readonly value: unknown };

export type MySQLProcedureArgument = MySQLProcedureInput | MySQLProcedureParameter;

export interface MySQLProcedureResult {
    readonly resultSets: readonly (readonly Record<string, unknown>[])[];
    readonly affectedRows: number;
    readonly outputParameters?: readonly unknown[];
}

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

    callProcedure(
        name: string,
        parameters: readonly MySQLProcedureArgument[] = [],
        schema?: string
    ): Promise<MySQLProcedureResult> {
        return this.enqueue(async () => {
            this.assertUsable();
            const args = parameters.map(normalizeProcedureParameter);
            const outputIndexes = args.flatMap((argument, index) =>
                argument.mode === 'out' || argument.mode === 'inout' ? [index] : []
            );
            const variables = new Map(outputIndexes.map(index =>
                [index, `@tyorm_${randomUUID().replaceAll('-', '')}_${index}`]
            ));

            let procedureResult: MySQLProcedureResult | undefined;
            let operationError: unknown;
            let operationFailed = false;
            try {
                if (outputIndexes.length > 0) {
                    const assignments = outputIndexes.map(index => `${variables.get(index)} = ?`);
                    const initialValues = outputIndexes.map(index => {
                        const argument = args[index];
                        if (!argument) throw new Error('Missing MySQL procedure parameter.');
                        return argument.mode === 'inout' ? toMySQLValue(argument.value) : null;
                    });
                    await this.client.query(`SET ${assignments.join(', ')}`, initialValues);
                }

                const placeholders = args.map((argument, index) => {
                    if (argument.mode === 'out' || argument.mode === 'inout') return variables.get(index);
                    return '?';
                });
                const sql = `CALL ${qualifiedTable(name, schema)}(${placeholders.join(', ')})`;
                const inputValues = args.flatMap(argument =>
                    argument.mode === 'in' ? [toMySQLValue(argument.value)] : []
                );
                const [result] = await this.client.execute<ProcedureCallPacket | RowDataPacket[][]>(
                    sql, inputValues
                );
                procedureResult = readProcedureResult(result);

                if (outputIndexes.length > 0) {
                    const selections = outputIndexes.map(index =>
                        `${variables.get(index)} AS \`output_${index}\``
                    );
                    const [outputRows] = await this.client.query<RowDataPacket[]>(
                        `SELECT ${selections.join(', ')}`
                    );
                    const outputRow = outputRows[0];
                    if (!outputRow) throw new Error('Missing MySQL procedure output row.');
                    const outputParameters: unknown[] = Array.from({ length: args.length });
                    for (const index of outputIndexes) {
                        outputParameters[index] = outputRow[`output_${index}`];
                    }
                    procedureResult = { ...procedureResult, outputParameters };
                }
            } catch (error) {
                operationFailed = true;
                operationError = error;
            }

            if (outputIndexes.length > 0) {
                try {
                    await this.clearProcedureVariables(variables);
                } catch (cleanupError) {
                    if (!operationFailed) throw cleanupError;
                    throw new AggregateError(
                        [operationError, cleanupError],
                        'MySQL procedure call and cleanup failed.'
                    );
                }
            }

            if (operationFailed) throw operationError;
            if (!procedureResult) throw new Error('MySQL procedure returned no result.');
            return procedureResult;
        });
    }

    private async clearProcedureVariables(variables: ReadonlyMap<number, string>): Promise<void> {
        if (variables.size === 0) return;
        const assignments = [...variables.values()].map(variable => `${variable} = NULL`);
        await this.client.query(`SET ${assignments.join(', ')}`);
    }

    private async executeStatement<T>({ sql, parameters }: Query): Promise<QueryResult<T>> {
        if ((parameters?.length ?? 0) === 0 && /^(?:CREATE|DROP)\s+(?:PROCEDURE|FUNCTION|TRIGGER)\b/i.test(sql.trim())) {
            const [result] = await this.client.query<RowDataPacket[] | ResultSetHeader>(sql);
            return Array.isArray(result)
                ? { rows: result as T[], affectedRows: null }
                : { rows: [], affectedRows: result.affectedRows };
        }
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

type NormalizedProcedureParameter =
    | { readonly mode: 'in'; readonly value: unknown }
    | { readonly mode: 'out' }
    | { readonly mode: 'inout'; readonly value: unknown };

function normalizeProcedureParameter(parameter: unknown): NormalizedProcedureParameter {
    if (typeof parameter !== 'object' || parameter === null || !('mode' in parameter)) {
        return { mode: 'in', value: parameter };
    }

    switch (parameter.mode) {
        case 'in':
            if (!('value' in parameter)) throw new TypeError('An IN procedure parameter requires a value.');
            return { mode: 'in', value: parameter.value };
        case 'out':
            return { mode: 'out' };
        case 'inout':
            if (!('value' in parameter)) throw new TypeError('An INOUT procedure parameter requires a value.');
            return { mode: 'inout', value: parameter.value };
        default:
            return { mode: 'in', value: parameter };
    }
}

function readProcedureResult(
    result: ProcedureCallPacket | RowDataPacket[][]
): MySQLProcedureResult {
    if (!Array.isArray(result)) return { resultSets: [], affectedRows: result.affectedRows };

    const status = result.at(-1);
    if (!status || Array.isArray(status)) throw new Error('Missing MySQL procedure status.');
    const resultSets: RowDataPacket[][] = [];
    for (const item of result) {
        if (Array.isArray(item)) resultSets.push(item);
    }
    return { resultSets, affectedRows: status.affectedRows };
}
