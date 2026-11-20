import type { DatabaseConnection } from '../drivers';
import type { QueryExpression, SelectQuery } from './ast';
import type { SqlCompiler } from './compiler';
import { QueryAstError } from './errors';
import { executeDtoQuery } from './execute-dto-query';
import type { QuerySemanticResolver } from './semantic';

type RecordFields = Readonly<Record<string, (value: unknown) => unknown>>;

export type QueryRecord<Fields extends RecordFields> = {
    readonly [Key in Extract<keyof Fields, string>]: ReturnType<Fields[Key]>;
};

/** Declares reusable field decoders for a query record. */
export function defineRecord<const Fields extends RecordFields>(fields: Fields): Readonly<Fields> {
    return Object.freeze({ ...fields });
}

/** Binds a record schema to one query and decodes each projected field. */
export async function executeRecordQuery<const Fields extends RecordFields>(
    executor: Pick<DatabaseConnection, 'execute'>,
    resolver: QuerySemanticResolver,
    compiler: SqlCompiler,
    query: Omit<SelectQuery, 'selections'>,
    record: Fields,
    select: Readonly<Record<Extract<keyof NoInfer<Fields>, string>, QueryExpression>>,
    parameters?: Readonly<Record<string, unknown>>
): Promise<QueryRecord<Fields>[]> {
    const fields = Object.entries(record);
    const bindings: Readonly<Record<string, QueryExpression>> = select;
    const aliases = new Set(fields.map(([alias]) => alias));
    const expressions = new Map(Object.entries(bindings));

    for (const alias of expressions.keys()) {
        if (!aliases.has(alias)) {
            throw new QueryAstError(`Unknown record selection "${alias}".`);
        }
    }

    const selections = Object.fromEntries(fields.map(([alias]) => {
        const expression = expressions.get(alias);
        if (expression === undefined) {
            throw new QueryAstError(`Missing record selection "${alias}".`);
        }
        return [alias, expression] as const;
    }));

    return executeDtoQuery(executor, resolver, compiler, query, {
        select: selections,
        map: row => Object.freeze(Object.fromEntries(fields.map(([alias, decode]) =>
            [alias, decode(row[alias])] as const
        ))) as QueryRecord<Fields>
    }, parameters);
}
