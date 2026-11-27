import type {
    BatchEntitySchema,
    BatchScalarDataType,
} from "../contracts/batch-entity-schema.contract.js";

export interface BatchFieldValidationIssue {
    readonly propertyName: string;
    readonly code: "MISSING_REQUIRED_FIELD" | "INVALID_FIELD_TYPE";
    readonly message: string;
}

export type BatchRecordValidationResult =
    | { readonly valid: true }
    | {
        readonly valid: false;
        readonly issues: readonly BatchFieldValidationIssue[];
    };

export class BatchRecordSchemaValidator {
    constructor(private readonly schema: BatchEntitySchema) { }

    validate(record: Record<string, unknown>): BatchRecordValidationResult {
        const issues: BatchFieldValidationIssue[] = [];

        for (const col of this.schema.columns) {
            const hasOwn = Object.hasOwn(record, col.propertyName);
            const value = hasOwn ? record[col.propertyName] : undefined;

            const isMissing = value === undefined || value === null || value === "";
            if (isMissing) {
                if (!col.nullable && !col.isGenerated) {
                    issues.push({
                        propertyName: col.propertyName,
                        code: "MISSING_REQUIRED_FIELD",
                        message: `Required field "${col.propertyName}" is missing or empty for entity "${this.schema.entityName}".`,
                    });
                }
                continue;
            }

            if (!this.matchesScalarType(col.dataType, value)) {
                issues.push({
                    propertyName: col.propertyName,
                    code: "INVALID_FIELD_TYPE",
                    message: `Field "${col.propertyName}" does not match expected type "${col.dataType}" for entity "${this.schema.entityName}".`,
                });
            }
        }

        if (issues.length > 0) {
            return {
                valid: false,
                issues: Object.freeze(issues),
            };
        }

        return { valid: true };
    }

    private matchesScalarType(dataType: BatchScalarDataType, value: unknown): boolean {
        switch (dataType) {
            case "integer":
                return typeof value === "number" && Number.isInteger(value);
            case "float":
                return typeof value === "number" && Number.isFinite(value);
            case "boolean":
                return typeof value === "boolean";
            case "string":
                return typeof value === "string";
            case "date":
                return value instanceof Date
                    ? !Number.isNaN(value.getTime())
                    : typeof value === "string" && !Number.isNaN(Date.parse(value));
            case "json":
                return typeof value === "object" && value !== null;
            case "vector":
                return Array.isArray(value) && value.every((n) => typeof n === "number" && Number.isFinite(n));
            default:
                return true;
        }
    }
}
