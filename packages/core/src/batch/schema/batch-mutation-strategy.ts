import type {
    BatchDbAction,
    BatchDbExecutor,
    BatchDbMutationRequest,
    BatchDbMutationResult,
} from "../contracts/batch-executor.contract.js";

export interface BatchActionHandler<T = Record<string, unknown>> {
    execute(
        entityName: string,
        records: readonly { readonly key?: Record<string, unknown>; readonly values: T }[],
    ): Promise<BatchDbMutationResult>;
}

export class BatchDbMutationExecutor implements BatchDbExecutor {
    private readonly handlers: Readonly<Record<BatchDbAction, BatchActionHandler<any>>>;

    constructor(handlers: Readonly<Record<BatchDbAction, BatchActionHandler<any>>>) {
        this.handlers = handlers;
    }

    async executeBatchMutation<T = Record<string, unknown>>(
        request: BatchDbMutationRequest<T>,
    ): Promise<BatchDbMutationResult> {
        if (request.records.length === 0) {
            return { affectedRows: 0 };
        }

        const handler = this.handlers[request.action];
        return handler.execute(request.entityName, request.records);
    }
}
