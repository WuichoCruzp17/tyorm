import type { ProcedureCall } from './sql-compiler';

export interface CompiledQuery {
    readonly sql: string;
    readonly parameters: readonly unknown[];
    readonly procedureCall?: ProcedureCall;
}
