
import type {
    CompiledQuery,
    SqlCompiler,
    SqlDialect,
    ResolvedSelectQuery,
    ResolvedJoin,
    ResolvedJoinCondition,
    ResolvedJoinColumn
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

        const context = new PostgresCompilationContext(
            parameters,
            this.dialect
        );

        const select = this.compileSelect(resolved, context);
        const from = this.compileFrom(resolved);

        const parts = [select, from];

        parts.push(
            ...this.compileJoins(resolved, context)
        );

        if (resolved.query.where !== undefined) {
            const predicateSql = this.predicates.compile(
                resolved.query.where,
                resolved,
                context
            );

            parts.push(`WHERE ${predicateSql}`);
        }

        const { groupBy } = resolved.query;
        if (groupBy !== undefined && groupBy.length > 0) {
            const columns = groupBy.map(expression =>
                this.expressions.compile(expression, resolved, context)
            );
            parts.push(`GROUP BY ${columns.join(', ')}`);
        }

        const { having } = resolved.query;
        if (having !== undefined) {
            const predicateSql = this.predicates.compile(having, resolved, context);
            parts.push(`HAVING ${predicateSql}`);
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
        resolved: ResolvedSelectQuery,
        context: PostgresCompilationContext
    ): string {

        const selections = resolved.query.selections;

        if (selections.length === 0) {
            throw new Error(
                'SELECT requires at least one expression.'
            );
        }

        const columns = selections.map(selection => {

            const expression = selection.expression;

            if (expression.kind !== 'column' && expression.kind !== 'aggregate') {
                throw new Error(
                    `Unsupported SELECT expression: ${expression.kind}.`
                );
            }

            const sql = this.expressions.compile(expression, resolved, context);
            if (selection.alias !== undefined) {
                return `${sql} AS ${this.dialect.quoteIdentifier(selection.alias)}`;
            }
            return sql;
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


    private compileJoinColumn(
        column: ResolvedJoinColumn
    ): string {
        const alias = this.dialect.quoteIdentifier(
            column.tableAlias
        );

        const columnName = this.dialect.quoteIdentifier(
            column.columnName
        );

        return `${alias}.${columnName}`;
    }


    private compileJoinCondition(
        condition: ResolvedJoinCondition
    ): string {
        const left = this.compileJoinColumn(
            condition.left
        );

        const right = this.compileJoinColumn(
            condition.right
        );

        return `${left} = ${right}`;
    }


    private compileJoin(
        join: ResolvedJoin,
        resolved: ResolvedSelectQuery,
        context: PostgresCompilationContext
    ): string {
        const joinType = join.join.type === 'inner'
            ? 'INNER JOIN'
            : join.join.type === 'left'
                ? 'LEFT JOIN'
                : undefined;

        if (joinType === undefined) {
            throw new Error(
                `Unsupported JOIN type: ${String(join.join.type)}.`
            );
        }

        const { plan } = join;
        const targetConditions = plan.kind === 'direct'
            ? plan.conditions
            : plan.targetConditions;

        if (plan.kind === 'direct' && targetConditions.length === 0) {
            throw new Error(
                'Direct JOIN requires at least one condition.'
            );
        }
        if (plan.kind === 'junction' &&
            (plan.sourceConditions.length === 0 || targetConditions.length === 0)) {
            throw new Error(
                'Junction JOIN requires conditions for both tables.'
            );
        }

        const conditionsSql = targetConditions.map(condition =>
            this.compileJoinCondition(condition)
        );

        if (join.join.on !== undefined) {
            const predicate = this.predicates.compile(
                join.join.on,
                resolved,
                context
            );
            conditionsSql.push(`(${predicate})`);
        }

        const entity = join.target.metadata.entity;
        const targetJoin = this.compileJoinClause(
            joinType,
            entity.tableName,
            entity.schema,
            join.target.alias,
            conditionsSql
        );

        if (plan.kind === 'direct') {
            return targetJoin;
        }

        const junctionJoin = this.compileJoinClause(
            joinType,
            plan.table.name,
            plan.table.schema,
            plan.table.alias,
            plan.sourceConditions.map(condition =>
                this.compileJoinCondition(condition)
            )
        );

        return `${junctionJoin} ${targetJoin}`;
    }


    private compileJoinClause(
        joinType: string,
        tableName: string,
        schema: string | undefined,
        alias: string,
        conditions: readonly string[]
    ): string {
        const table = this.dialect.quoteIdentifier(tableName);
        const qualifier = schema
            ? `${this.dialect.quoteIdentifier(schema)}.`
            : '';
        const tableAlias = this.dialect.quoteIdentifier(alias);

        return `${joinType} ${qualifier}${table} AS ${tableAlias} ON ${conditions.join(' AND ')}`;
    }


    private compileJoins(
        resolved: ResolvedSelectQuery,
        context: PostgresCompilationContext
    ): string[] {
        return resolved.joins.map(join =>
            this.compileJoin(join, resolved, context)
        );
    }


}
