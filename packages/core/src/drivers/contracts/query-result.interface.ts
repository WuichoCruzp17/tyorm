
export interface QueryResult<
    T = Record<string, unknown>
> {

    /**
     * Returned records. For routines with multiple sets, this is the first set.
     */
    readonly rows: T[];

    /**
     * Number of affected records.
     * Null when the driver cannot determine it.
     */
    readonly affectedRows: number | null;

    /**
     * All result sets returned by a routine, when the driver supports them.
     */
    readonly resultSets?: readonly (readonly T[])[];

    /**
     * Output parameter values in call-argument order, when supported.
     */
    readonly outputParameters?: readonly unknown[];

    /**
     * Executed SQL command, when available.
     */
    readonly command?: string;

}
