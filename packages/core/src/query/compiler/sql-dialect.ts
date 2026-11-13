export interface SqlDialect {

    quoteIdentifier(identifier: string): string;

    parameter(index: number): string;
}
