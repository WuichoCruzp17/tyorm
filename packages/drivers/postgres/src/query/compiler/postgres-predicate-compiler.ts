
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
 * a expresiones SQL compatibles con PostgreSQL.
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
                return this.compileLogical(
                    predicate,
                    resolved,
                    context
                );

            case 'not':
                return this.compileNot(
                    predicate,
                    resolved,
                    context
                );

            case 'is-null':
                return this.compileIsNull(
                    predicate,
                    resolved,
                    context
                );

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

    /**
     * Compila AND y OR.
     *
     * Los paréntesis preservan la estructura
     * lógica del AST.
     */
    private compileLogical(
        predicate: Extract<
            QueryPredicate,
            { kind: 'logical' }
        >,
        resolved: ExpressionResolutionContext,
        context: PostgresCompilationContext
    ): string {
        if (predicate.predicates.length === 0) {
            throw new Error(
                'Logical predicate requires at least one predicate.'
            );
        }

        const operator =
            predicate.operator === 'and' ? 'AND' : 'OR';

        const expressions = predicate.predicates.map(
            child => this.compile(
                child,
                resolved,
                context
            )
        );

        const separator = ` ${operator} `;
        return `(${expressions.join(separator)})`;
    }

    /**
     * Compila la negación de un predicado.
     */
    private compileNot(
        predicate: Extract<
            QueryPredicate,
            { kind: 'not' }
        >,
        resolved: ExpressionResolutionContext,
        context: PostgresCompilationContext
    ): string {
        const expression = this.compile(
            predicate.predicate,
            resolved,
            context
        );

        return `NOT (${expression})`;
    }

    /**
     * Compila IS NULL e IS NOT NULL.
     */
    private compileIsNull(
        predicate: Extract<
            QueryPredicate,
            { kind: 'is-null' }
        >,
        resolved: ExpressionResolutionContext,
        context: PostgresCompilationContext
    ): string {
        const expression = this.expressions.compile(
            predicate.expression,
            resolved,
            context
        );

        return predicate.negated
            ? `${expression} IS NOT NULL`
            : `${expression} IS NULL`;
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
