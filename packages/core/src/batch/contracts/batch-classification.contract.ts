export type BatchActionType = "INSERT" | "UPDATE" | "UPSERT" | "API" | "REJECT";

export type ExecutableBatchAction = Exclude<BatchActionType, "REJECT">;

export interface ClassifiedBatchItem<T = Record<string, unknown>> {
    readonly recordIndex: number;
    readonly sourceLine?: number;
    readonly action: BatchActionType;
    readonly payload: T;
    readonly key?: Record<string, unknown>;
    readonly rejectionReason?: string;
}

export interface BatchChunk<T = Record<string, unknown>> {
    readonly chunkId: string;
    readonly sequence: number;
    readonly action: ExecutableBatchAction;
    readonly items: readonly ClassifiedBatchItem<T>[];
}
