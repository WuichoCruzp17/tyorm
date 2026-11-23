
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

export type AggregateExpression =
    | {
        readonly kind: 'aggregate';
        readonly function: 'count';
        readonly argument?: ColumnExpression;
    }
    | {
        readonly kind: 'aggregate';
        readonly function: 'sum' | 'avg' | 'min' | 'max';
        readonly argument: ColumnExpression;
    };

export interface VectorDistanceExpression {
    readonly kind: 'vector-distance';
    readonly metric: 'l2' | 'cosine';
    readonly column: ColumnExpression;
    readonly vector: readonly number[];
}

export type QueryExpression =
    | VectorDistanceExpression
    | AggregateExpression
    | ColumnExpression
    | ParameterExpression
    | LiteralExpression
    | NullExpression;
