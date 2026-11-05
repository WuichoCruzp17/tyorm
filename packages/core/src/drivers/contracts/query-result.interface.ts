
export interface QueryResult<
    T = Record<string, unknown>
> {

    /**
     * Returned records.
     */
    readonly rows: T[];

    /**
     * Number of affected records.
     * Null when the driver cannot determine it.
     */
    readonly affectedRows: number | null;

    /**
     * Executed SQL command, when available.
     */
    readonly command?: string;

}
