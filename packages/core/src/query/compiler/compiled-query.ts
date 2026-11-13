export interface CompiledQuery {
    readonly sql: string;
    readonly parameters: readonly unknown[];
}
