
import type {
    CompiledQuery,
    SqlCompiler,
    SqlDialect,
    ResolvedSelectQuery,
    ResolvedColumnReference
} from '@tyorm/core';

import {
    PostgresSqlDialect
} from './postgres-sql-dialect';

import {
    PostgresCompilationContext
} from './postgres-compilation-context';

import {
    PostgresPredicateCompiler
} from './postgres-predicate-compiler';

import {
    PostgresExpressionCompiler
} from './postgres-expression-compiler';
export class PostgresSelectCompiler implements SqlCompiler {



    constructor(
        private readonly dialect: SqlDialect =
            new PostgresSqlDialect(),
        private readonly expressions =
            new PostgresExpressionCompiler(dialect),
        private readonly predicates =
            new PostgresPredicateCompiler(expressions)
    ) { }


    compile(
        resolved: ResolvedSelectQuery,
        parameters: Readonly<Record<string, unknown>> = {}
    ): CompiledQuery {

        if (resolved.query.joins.length > 0) {
            throw new Error(
                'JOIN is not supported yet.'
            );
        }

        const context = new PostgresCompilationContext(
            parameters,
            this.dialect
        );

        const select = this.compileSelect(resolved);
        const from = this.compileFrom(resolved);

        const parts = [select, from];

        if (resolved.query.where !== undefined) {
            const predicateSql = this.predicates.compile(
                resolved.query.where,
                resolved,
                context
            );

            parts.push(`WHERE ${predicateSql}`);
        }

        if (resolved.query.orderBy.length > 0) {
            parts.push(
                this.compileOrderBy(resolved, context)
            );
        }

        parts.push(
            ...this.compilePagination(resolved, context)
        );

        return Object.freeze({
            sql: parts.join(' '),
            parameters: context.getParameters()
        });
    }


    private compileSelect(
        resolved: ResolvedSelectQuery
    ): string {

        const selections = resolved.query.selections;

        if (selections.length === 0) {
            throw new Error(
                'SELECT requires at least one expression.'
            );
        }

        const columns = selections.map(selection => {

            const expression = selection.expression;

            if (expression.kind !== 'column') {
                throw new Error(
                    `Unsupported SELECT expression: ${expression.kind}.`
                );
            }

            const reference = this.findResolvedColumn(
                resolved,
                expression.alias,
                expression.property
            );

            return this.compileColumn(reference);
        });

        const distinct = resolved.query.distinct
            ? 'DISTINCT '
            : '';

        return `SELECT ${distinct}${columns.join(', ')}`;
    }

    private compileFrom(
        resolved: ResolvedSelectQuery
    ): string {

        const from = resolved.query.from;

        const root = resolved.aliases.get(from.alias);

        if (!root) {
            throw new Error(
                `Unresolved root alias "${from.alias}".`
            );
        }

        const entity = root.metadata.entity;

        const tableName = this.dialect.quoteIdentifier(
            entity.tableName
        );

        const schema = entity.schema
            ? `${this.dialect.quoteIdentifier(entity.schema)}.`
            : '';

        const alias = this.dialect.quoteIdentifier(
            from.alias
        );

        return `FROM ${schema}${tableName} AS ${alias}`;
    }

    private compileColumn(
        reference: ResolvedColumnReference
    ): string {

        const alias = this.dialect.quoteIdentifier(
            reference.tableAlias
        );

        const columnName = this.dialect.quoteIdentifier(
            reference.columnName
        );

        return `${alias}.${columnName}`;
    }

    private findResolvedColumn(
        resolved: ResolvedSelectQuery,
        alias: string,
        property: string
    ): ResolvedColumnReference {

        const reference = resolved.columns.find(
            item =>
                item.sourceAlias === alias &&
                item.property === property
        );

        if (!reference) {
            throw new Error(
                `Unresolved column "${alias}.${property}".`
            );
        }

        return reference;
    }


    private compileOrderBy(
        resolved: ResolvedSelectQuery,
        context: PostgresCompilationContext
    ): string {

        const orders = resolved.query.orderBy;

        if (orders.length === 0) {
            return '';
        }

        const expressions = orders.map(order => {

            const expression = this.expressions.compile(
                order.expression,
                resolved,
                context
            );

            const direction = order.direction === 'asc'
                ? 'ASC'
                : 'DESC';

            return `${expression} ${direction}`;
        });

        return `ORDER BY ${expressions.join(', ')}`;
    }


    private compilePagination(
        resolved: ResolvedSelectQuery,
        context: PostgresCompilationContext
    ): string[] {

        const parts: string[] = [];

        const { limit, offset } = resolved.query;

        if (limit !== undefined) {
            const placeholder = context.bindValue(limit);

            parts.push(`LIMIT ${placeholder}`);
        }

        if (offset !== undefined) {
            const placeholder = context.bindValue(offset);

            parts.push(`OFFSET ${placeholder}`);
        }

        return parts;
    }


}
