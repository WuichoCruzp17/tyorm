export type RowAnomalySeverity = "warning" | "error";

export type RowAnomalyCode =
    | "MALFORMED_ROW"
    | "COLUMN_COUNT_MISMATCH"
    | "INVALID_ENCODING"
    | "CONTROL_CHARACTERS"
    | "SUSPICIOUS_PATTERN"
    | "TYPE_COERCION_WARNING"
    | (string & {});

export interface RowAnomaly {
    readonly code: RowAnomalyCode;
    readonly column?: string;
    readonly message: string;
    readonly severity: RowAnomalySeverity;
}

export interface RawBatchRecord<T = Record<string, unknown>> {
    readonly recordIndex: number;
    readonly sourceLine?: number;
    readonly data: T;
    readonly anomalies: readonly RowAnomaly[];
    readonly isStructurallyValid: boolean;
}
