export type BatchFailureStage =
    | "SOURCE_INGESTION"
    | "BUSINESS_RULE"
    | "DB_EXECUTION"
    | "API_EXECUTION";

export interface BatchItemFailure {
    readonly recordIndex: number;
    readonly sourceLine?: number;
    readonly stage: BatchFailureStage;
    readonly code: string;
    readonly message: string;
    readonly rawData?: unknown;
}

export type BatchExecutionStatus =
    | "COMPLETED"
    | "PARTIAL_SUCCESS"
    | "FAILED_ROLLED_BACK";

export interface BatchExecutionMetrics {
    readonly totalRead: number;
    readonly validCount: number;
    readonly insertedCount: number;
    readonly updatedCount: number;
    readonly upsertedCount: number;
    readonly apiDispatchedCount: number;
    readonly rejectedCount: number;
    readonly failedCount: number;
    readonly chunksProcessed: number;
}

export interface BatchExecutionReport {
    readonly status: BatchExecutionStatus;
    readonly durationMs: number;
    readonly metrics: BatchExecutionMetrics;
    readonly failures: readonly BatchItemFailure[];
}
