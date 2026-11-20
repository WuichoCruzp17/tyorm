import type { DatabaseConnection } from '../drivers';
import type { QueryExpression, SelectQuery } from './ast';
import type { SqlCompiler } from './compiler';
import { QueryAstError } from './errors';
import type { QuerySemanticResolver } from './semantic';

/**
 * Executes an explicitly aliased projection and maps each row to a DTO.
 * The mapper validates or converts values returned by the database driver.
 */
export async function executeDtoQuery<
    const Selection extends Readonly<Record<string, QueryExpression>>,
    Dto
>(
    executor: Pick<DatabaseConnection, 'execute'>,
    resolver: QuerySemanticResolver,
    compiler: SqlCompiler,
    query: Omit<SelectQuery, 'selections'>,
    projection: {
        readonly select: Selection;
        readonly map: (row: Readonly<Record<Extract<keyof Selection, string>, unknown>>) => Dto;
    },
    parameters?: Readonly<Record<string, unknown>>
): Promise<Dto[]> {
    const selections = Object.entries<QueryExpression>(projection.select)
        .map(([alias, expression]) => ({ alias, expression }));

    if (selections.length === 0) {
        throw new QueryAstError('DTO projection requires at least one selection.');
    }

    const resolved = resolver.resolve({ ...query, selections });
    const { rows } = await executor.execute(compiler.compile(resolved, parameters));

    return rows.map(row => {
        const entries = selections.map(({ alias }) => {
            if (!Object.hasOwn(row, alias)) {
                throw new Error(`Missing DTO projection alias "${alias}" in query result.`);
            }
            return [alias, row[alias]] as const;
        });

        // Each selected alias is backed by an own property in the driver row.
        const projected = Object.fromEntries(entries) as Readonly<
            Record<Extract<keyof Selection, string>, unknown>
        >;
        return projection.map(projected);
    });
}
