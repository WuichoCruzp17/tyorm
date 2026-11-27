import type {
    BatchEntityColumnSchema,
    BatchEntitySchema,
} from "../contracts/batch-entity-schema.contract.js";

export type BatchProjectionMode = "INSERT" | "UPDATE";

export interface BatchColumnProjectionResult {
    readonly values: Record<string, unknown>;
    readonly omittedColumns: readonly string[];
}

export class BatchColumnProjector {
    constructor(private readonly schema: BatchEntitySchema) { }

    project(
        record: Record<string, unknown>,
        mode: BatchProjectionMode,
    ): BatchColumnProjectionResult {
        const values: Record<string, unknown> = {};
        const omittedColumns: string[] = [];

        for (const col of this.schema.columns) {
            const hasOwn = Object.prototype.hasOwnProperty.call(record, col.propertyName);
            if (!hasOwn) {
                continue;
            }

            if (!this.shouldIncludeColumn(col, mode)) {
                omittedColumns.push(col.propertyName);
                continue;
            }

            const rawValue = record[col.propertyName];
            if (rawValue === undefined) {
                omittedColumns.push(col.propertyName);
                continue;
            }

            values[col.propertyName] = rawValue;
        }

        return {
            values: Object.freeze(values),
            omittedColumns: Object.freeze(omittedColumns),
        };
    }

    private shouldIncludeColumn(
        col: BatchEntityColumnSchema,
        mode: BatchProjectionMode,
    ): boolean {
        if (mode === "UPDATE") {
            // En UPDATE no se sobrescriben claves primarias ni columnas no actualizables
            if (col.isPrimaryKey || !col.updatable) {
                return false;
            }
            return true;
        }

        // En INSERT se omiten columnas generadas automáticamente (ej. auto-increment / uuid)
        if (col.isGenerated) {
            return false;
        }

        return true;
    }
}
