
export type QueryValue =
    | string
    | number
    | boolean
    | bigint
    | Date
    | Uint8Array
    | null;

export interface ColumnExpression {
    readonly kind: 'column';
    readonly alias: string;
    readonly property: string;
}

export interface ParameterExpression {
    readonly kind: 'parameter';
    readonly name: string;
}

export interface LiteralExpression {
    readonly kind: 'literal';
    readonly value: QueryValue;
}

export interface NullExpression {
    readonly kind: 'null';
}

export type QueryExpression =
    | ColumnExpression
    | ParameterExpression
    | LiteralExpression
    | NullExpression;
