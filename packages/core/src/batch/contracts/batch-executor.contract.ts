import type { BatchChunk } from "./batch-classification.contract.js";

export type BatchDbAction = "INSERT" | "UPDATE" | "UPSERT";

export interface BatchDbMutationRecord<T = Record<string, unknown>> {
    readonly key?: Record<string, unknown>;
    readonly values: T;
}

export interface BatchDbMutationRequest<T = Record<string, unknown>> {
    readonly entityName: string;
    readonly action: BatchDbAction;
    readonly records: readonly BatchDbMutationRecord<T>[];
}

export interface BatchDbMutationResult {
    readonly affectedRows: number;
}

export interface BatchDbExecutor {
    executeBatchMutation<T = Record<string, unknown>>(
        request: BatchDbMutationRequest<T>,
    ): Promise<BatchDbMutationResult>;
}

export interface ExternalApiClient<TItem = Record<string, unknown>, TResult = unknown> {
    executeChunk(chunk: BatchChunk<TItem>): Promise<readonly TResult[]>;
}
