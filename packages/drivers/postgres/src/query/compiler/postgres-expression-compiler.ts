
import type {
    QueryExpression,
    ResolvedSelectQuery,
    SqlDialect
} from '@tyorm/core';

import { PostgresSqlDialect } from './postgres-sql-dialect';
import { PostgresCompilationContext } from './postgres-compilation-context';

/**
 * Información semántica necesaria para compilar
 * expresiones SQL.
 *
 * Evita depender de toda la estructura de
 * ResolvedSelectQuery cuando únicamente se
 * necesitan las columnas resueltas.
 */
export type ExpressionResolutionContext = Pick<
    ResolvedSelectQuery,
    'columns'
>;

/**
 * Compilador de expresiones SQL para PostgreSQL.
 *
 * Responsabilidades:
 * - Resolver referencias a columnas físicas.
 * - Compilar parámetros nombrados.
 * - Compilar expresiones NULL.
 * - Rechazar expresiones todavía no soportadas.
 *
 * La gestión de parámetros corresponde a
 * PostgresCompilationContext.
 */
export class PostgresExpressionCompiler {
    private static readonly aggregates = new Map([
        ['count', 'COUNT'],
        ['sum', 'SUM'],
        ['avg', 'AVG'],
        ['min', 'MIN'],
        ['max', 'MAX']
    ]);


    constructor(
        private readonly dialect: SqlDialect =
            new PostgresSqlDialect()
    ) { }

    /**
     * Compila una expresión del AST a SQL.
     */
    compile(
        expression: QueryExpression,
        resolved: ExpressionResolutionContext,
        context: PostgresCompilationContext
    ): string {
        switch (expression.kind) {

            case 'column':
                return this.compileColumn(
                    expression.alias,
                    expression.property,
                    resolved
                );

            case 'aggregate': {
                const name = PostgresExpressionCompiler.aggregates.get(expression.function);
                if (name === undefined) {
                    throw new Error('Unsupported aggregate function.');
                }

                const argument = expression.argument;
                if (argument === undefined) {
                    if (expression.function !== 'count') {
                        throw new Error('Aggregate requires a column argument.');
                    }
                    return 'COUNT(*)';
                }

                const column = this.compileColumn(argument.alias, argument.property, resolved);
                return `${name}(${column})`;
            }

            case 'parameter':
                return context.bind(expression.name);

            case 'null':
                return 'NULL';

            case 'literal':
                return context.bindValue(expression.value);

            default:
                return this.assertNever(expression);
        }
    }

    /**
     * Compila una referencia a columna utilizando
     * el nombre físico obtenido por el resolvedor
     * semántico.
     *
     * Ejemplo:
     * u.firstName -> "u"."first_name"
     */
    private compileColumn(
        alias: string,
        property: string,
        resolved: ExpressionResolutionContext
    ): string {

        const reference = resolved.columns.find(
            column =>
                column.sourceAlias === alias &&
                column.property === property
        );

        if (!reference) {
            throw new Error(
                `Unresolved column "${alias}.${property}".`
            );
        }

        const tableAlias = this.dialect.quoteIdentifier(
            reference.tableAlias
        );

        const columnName = this.dialect.quoteIdentifier(
            reference.columnName
        );

        return `${tableAlias}.${columnName}`;
    }

    /**
     * Garantiza exhaustividad al evaluar los
     * distintos tipos de QueryExpression.
     *
     * Si se agrega una nueva variante al AST,
     * TypeScript exigirá contemplarla aquí.
     */
    private assertNever(value: never): never {
        throw new Error(
            `Unsupported query expression: ${String(value)}`
        );
    }
}
