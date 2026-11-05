
export type IsolationLevel =
    | 'READ_UNCOMMITTED'
    | 'READ_COMMITTED'
    | 'REPEATABLE_READ'
    | 'SERIALIZABLE';

export interface TransactionOptions {

    /**
     * Transaction isolation level.
     */
    isolationLevel?: IsolationLevel;

    /**
     * Indicates whether the transaction is read-only.
     */
    readOnly?: boolean;

}
