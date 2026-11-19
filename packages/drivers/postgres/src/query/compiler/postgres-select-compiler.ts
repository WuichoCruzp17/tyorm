
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
        private readonly predicates =
            new PostgresPredicateCompiler(
                new PostgresExpressionCompiler(dialect)
            )
    ) { }

    compile(
        resolved: ResolvedSelectQuery,
        parameters: Readonly<Record<string, unknown>> = {}
    ): CompiledQuery {

        // Todavía no soportamos JOIN ni ORDER BY.
        if (
            resolved.query.joins.length > 0 ||
            resolved.query.orderBy.length > 0
        ) {
            throw new Error(
                'JOIN and ORDER BY are not supported yet.'
            );
        }

        // Evitamos descartar silenciosamente la paginación.
        if (
            resolved.query.limit !== undefined ||
            resolved.query.offset !== undefined
        ) {
            throw new Error(
                'LIMIT and OFFSET are not supported yet.'
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
}
