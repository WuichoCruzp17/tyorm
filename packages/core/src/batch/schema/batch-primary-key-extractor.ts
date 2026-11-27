import type { BatchEntitySchema } from "../contracts/batch-entity-schema.contract.js";

export type PrimaryKeyExtractionResult =
    | {
        readonly ok: true;
        readonly key: Record<string, unknown>;
    }
    | {
        readonly ok: false;
        readonly missingKeys: readonly string[];
        readonly reason: string;
    };

export class BatchPrimaryKeyExtractor {
    constructor(private readonly schema: BatchEntitySchema) { }

    extract(record: Record<string, unknown>): PrimaryKeyExtractionResult {
        if (this.schema.primaryKeys.length === 0) {
            return {
                ok: false,
                missingKeys: [],
                reason: `Entity "${this.schema.entityName}" does not define any primary keys.`,
            };
        }

        const missingKeys: string[] = [];
        const key: Record<string, unknown> = {};

        for (const pkProperty of this.schema.primaryKeys) {
            const hasOwn = Object.hasOwn(record, pkProperty);
            const value = hasOwn ? record[pkProperty] : undefined;

            if (!hasOwn || value === undefined || value === null || value === "") {
                missingKeys.push(pkProperty);
                continue;
            }

            key[pkProperty] = value;
        }

        if (missingKeys.length > 0) {
            return {
                ok: false,
                missingKeys: Object.freeze(missingKeys),
                reason: `Missing or empty primary key field(s) for "${this.schema.entityName}": ${missingKeys.join(", ")}.`,
            };
        }

        return {
            ok: true,
            key: Object.freeze(key),
        };
    }
}
