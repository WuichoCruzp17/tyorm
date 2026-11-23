import type { ColumnMetadata, EntityTarget, OrmMetadataModel } from '../metadata';

type Values = Readonly<Record<string, unknown>>;

export type MutationQuery =
    | { readonly kind: 'insert'; readonly entity: EntityTarget; readonly values: Values }
    | { readonly kind: 'update'; readonly entity: EntityTarget; readonly key: Values; readonly values: Values }
    | { readonly kind: 'delete'; readonly entity: EntityTarget; readonly key: Values };

interface Binding {
    readonly column: string;
    readonly value: unknown;
}

interface MutationTarget {
    readonly table: string;
    readonly schema: string | undefined;
    readonly returning: readonly { readonly column: string; readonly alias: string }[];
}

export type ResolvedMutation =
    | (MutationTarget & { readonly kind: 'insert'; readonly values: readonly Binding[] })
    | (MutationTarget & { readonly kind: 'update'; readonly key: readonly Binding[]; readonly values: readonly Binding[] })
    | (MutationTarget & { readonly kind: 'delete'; readonly key: readonly Binding[] });

export function resolveMutation(model: OrmMetadataModel, query: MutationQuery): ResolvedMutation {
    const { entity } = model.getEntity(query.entity);
    const keys = entity.primaryKeys;
    const columns = new Map<string, ColumnMetadata>();
    for (const column of [...keys, ...entity.columns]) {
        if (typeof column.propertyKey !== 'string') {
            throw new Error('Mutation queries require string property names.');
        }
        columns.set(column.propertyKey, column);
    }
    const target = {
        table: entity.tableName,
        schema: entity.schema,
        returning: [...columns].map(([alias, column]) => ({ column: column.columnName, alias }))
    };

    switch (query.kind) {
        case 'insert': {
            const generated = new Set<ColumnMetadata>(keys.filter(key => key.generation !== 'none'));
            const writable = new Map([...columns].filter(([, column]) => column.insertable && !generated.has(column)));
            const values = bindings(query.values, writable);
            for (const [name, column] of writable) {
                if (Object.hasOwn(query.values, name)) continue;
                if (column.hasDefault) {
                    values.push(bind(column, column.defaultValue));
                } else if (!column.nullable) {
                    throw new Error(`Missing required insert property "${name}".`);
                }
            }
            return { ...target, kind: 'insert', values };
        }
        case 'update': {
            const writable = new Map([...columns].filter(([, column]) => column.updatable && !keys.some(key => key === column)));
            const values = bindings(query.values, writable);
            if (values.length === 0) throw new Error('UPDATE requires at least one property.');
            return { ...target, kind: 'update', key: keyBindings(query.key, keys), values };
        }
        case 'delete':
            return { ...target, kind: 'delete', key: keyBindings(query.key, keys) };
        default:
            throw new Error('Unsupported mutation kind.');
    }
}

function keyBindings(values: Values, keys: readonly ColumnMetadata[]): Binding[] {
    const allowed = new Map(keys.flatMap(key =>
        typeof key.propertyKey === 'string' ? [[key.propertyKey, key] as const] : []
    ));
    const result = bindings(values, allowed);
    if (keys.length === 0 || result.length !== keys.length) {
        throw new Error('Mutation requires exactly the primary-key properties.');
    }
    return result;
}

function bindings(values: Values, allowed: ReadonlyMap<string, ColumnMetadata>): Binding[] {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error('Mutation properties must be supplied as an object.');
    }
    return Reflect.ownKeys(values).map(name => {
        const column = typeof name === 'string' ? allowed.get(name) : undefined;
        if (column === undefined || typeof name !== 'string') {
            throw new Error(`Property "${String(name)}" is not writable in this mutation.`);
        }
        return bind(column, values[name]);
    });
}

function bind(column: ColumnMetadata, value: unknown): Binding {
    if (value === undefined || (value === null && !column.nullable)) {
        throw new Error(`Invalid mutation value for "${String(column.propertyKey)}".`);
    }
    return { column: column.columnName, value };
}
