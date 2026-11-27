import type { BatchEntitySchema } from "../contracts/batch-entity-schema.contract.js";
import type {
    BatchDbAction,
    BatchDbMutationRecord,
    BatchDbMutationRequest,
} from "../contracts/batch-executor.contract.js";

export class BatchMutationRequestBuilder {
    private readonly primaryKeys: readonly string[];
    private readonly insertProps: readonly string[];
    private readonly updateProps: readonly string[];

    constructor(private readonly schema: BatchEntitySchema) {
        this.primaryKeys = schema.primaryKeys;
        this.insertProps = schema.columns
            .filter((col) => !col.isGenerated)
            .map((col) => col.propertyName);
        this.updateProps = schema.columns
            .filter((col) => !col.isPrimaryKey && col.updatable)
            .map((col) => col.propertyName);
    }

    build(
        action: BatchDbAction,
        rows: readonly Record<string, unknown>[],
    ): BatchDbMutationRequest {
        const targetProps = action === "INSERT" ? this.insertProps : this.updateProps;
        const records: BatchDbMutationRecord[] = [];

        for (const row of rows) {
            const values: Record<string, unknown> = {};

            for (const prop of targetProps) {
                const val = row[prop];
                if (val !== undefined) {
                    values[prop] = val;
                }
            }

            if (action === "INSERT") {
                records.push({ values });
                continue;
            }

            const key: Record<string, unknown> = {};
            for (const pk of this.primaryKeys) {
                key[pk] = row[pk];
            }

            records.push({ key, values });
        }

        return {
            entityName: this.schema.entityName,
            action,
            records,
        };
    }
}
