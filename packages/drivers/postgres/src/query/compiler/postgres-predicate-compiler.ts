
import type {
    ComparisonOperator,
    QueryPredicate
} from '@tyorm/core';

import {
    PostgresExpressionCompiler,
    type ExpressionResolutionContext
} from './postgres-expression-compiler';

import {
    PostgresCompilationContext
} from './postgres-compilation-context';

/**
 * Compila predicados del AST de TyORM
 * a expresiones SQL de PostgreSQL.
 *
 * Bloque actual:
 * - Comparaciones.
 *
 * Bloques posteriores:
 * - AND, OR, NOT.
 * - IS NULL.
 * - IN.
 * - BETWEEN.
 */
export class PostgresPredicateCompiler {

    constructor(
        private readonly expressions =
            new PostgresExpressionCompiler()
    ) { }

    compile(
        predicate: QueryPredicate,
        resolved: ExpressionResolutionContext,
        context: PostgresCompilationContext
    ): string {
        switch (predicate.kind) {
            case 'comparison':
                return this.compileComparison(
                    predicate,
                    resolved,
                    context
                );

            case 'logical':
            case 'not':
            case 'is-null':
            case 'in':
            case 'between':
                throw new Error(
                    `Unsupported predicate kind: ${predicate.kind}.`
                );

            default:
                return this.assertNever(predicate);
        }
    }

    private compileComparison(
        predicate: Extract<
            QueryPredicate,
            { kind: 'comparison' }
        >,
        resolved: ExpressionResolutionContext,
        context: PostgresCompilationContext
    ): string {
        const operator = this.compileOperator(
            predicate.operator
        );

        const left = this.expressions.compile(
            predicate.left,
            resolved,
            context
        );

        const right = this.expressions.compile(
            predicate.right,
            resolved,
            context
        );

        return `${left} ${operator} ${right}`;
    }

    private compileOperator(
        operator: ComparisonOperator
    ): string {
        switch (operator) {
            case 'eq':
                return '=';

            case 'ne':
                return '<>';

            case 'gt':
                return '>';

            case 'gte':
                return '>=';

            case 'lt':
                return '<';

            case 'lte':
                return '<=';

            case 'like':
                return 'LIKE';

            case 'not-like':
                return 'NOT LIKE';

            default:
                return this.assertNever(operator);
        }
    }

    private assertNever(value: never): never {
        throw new Error(
            `Unsupported predicate: ${String(value)}`
        );
    }
}
