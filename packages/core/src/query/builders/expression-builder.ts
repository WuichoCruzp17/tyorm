
import type {
    AggregateExpression,
    ColumnExpression,
    ParameterExpression,
    LiteralExpression,
    NullExpression,
    QueryValue
} from '../ast';

import { QueryAstError } from '../errors';

function requireIdentifier(
    value: string,
    label: string
): string {
    if (
        typeof value !== 'string' ||
        value.trim().length === 0
    ) {
        throw new QueryAstError(
            `${label} must be a non-empty string.`
        );
    }

    // Identificadores lógicos, no fragmentos SQL.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
        throw new QueryAstError(
            `Invalid ${label}: "${value}".`
        );
    }

    return value;
}

export function column(
    alias: string,
    property: string
): ColumnExpression {
    return Object.freeze({
        kind: 'column' as const,
        alias: requireIdentifier(alias, 'Column alias'),
        property: requireIdentifier(
            property,
            'Column property'
        )
    });
}

export function count(argument?: ColumnExpression): AggregateExpression {
    return Object.freeze({
        kind: 'aggregate',
        function: 'count',
        ...(argument === undefined ? {} : { argument })
    });
}

export function sum(argument: ColumnExpression): AggregateExpression {
    return Object.freeze({ kind: 'aggregate', function: 'sum', argument });
}

export function avg(argument: ColumnExpression): AggregateExpression {
    return Object.freeze({ kind: 'aggregate', function: 'avg', argument });
}

export function min(argument: ColumnExpression): AggregateExpression {
    return Object.freeze({ kind: 'aggregate', function: 'min', argument });
}

export function max(argument: ColumnExpression): AggregateExpression {
    return Object.freeze({ kind: 'aggregate', function: 'max', argument });
}

export function param(
    name: string
): ParameterExpression {
    return Object.freeze({
        kind: 'parameter' as const,
        name: requireIdentifier(name, 'Parameter name')
    });
}

export function literal(
    value: QueryValue
): LiteralExpression {
    const valid =
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        value instanceof Date ||
        value instanceof Uint8Array;

    if (
        !valid ||
        (typeof value === 'number' &&
            !Number.isFinite(value)) ||
        (value instanceof Date &&
            Number.isNaN(value.getTime()))
    ) {
        throw new QueryAstError(
            'Unsupported query literal value.'
        );
    }

    // Copiar valores mutables para evitar referencias externas.
    const snapshot =
        value instanceof Date
            ? new Date(value.getTime())
            : value instanceof Uint8Array
                ? new Uint8Array(value)
                : value;

    return Object.freeze({
        kind: 'literal' as const,
        value: snapshot
    });
}

export function nullExpression(): NullExpression {
    return Object.freeze({
        kind: 'null' as const
    });
}
