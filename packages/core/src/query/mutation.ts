import type { ColumnMetadata, EntityTarget, OrmMetadataModel, PrimaryKeyMetadata } from '../metadata';

type Values = Readonly<Record<string, unknown>>;

export type MutationQuery =
    | { readonly kind: 'insert'; readonly entity: EntityTarget; readonly values: Values }
    | { readonly kind: 'update'; readonly entity: EntityTarget; readonly key: Values; readonly values: Values }
    | { readonly kind: 'delete'; readonly entity: EntityTarget; readonly key: Values }
    | { readonly kind: 'save'; readonly entity: EntityTarget; readonly values: Values };

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
    | (MutationTarget & { readonly kind: 'insert'; readonly values: readonly Binding[]; readonly primaryKeys?: readonly PrimaryKeyMetadata[] })
    | (MutationTarget & { readonly kind: 'update'; readonly key: readonly Binding[]; readonly values: readonly Binding[] })
    | (MutationTarget & { readonly kind: 'delete'; readonly key: readonly Binding[] })
    | (MutationTarget & {
        readonly kind: 'upsert';
        readonly values: readonly Binding[];
        readonly conflictColumns: readonly string[];
        readonly assignments: readonly Binding[];
    });

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
        case 'insert':
            return { ...target, kind: 'insert', values: insertBindings(query.values, columns, keys), primaryKeys: keys };
        case 'save':
            return resolveSave(query.values, target, columns, keys);
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

function resolveSave(
    values: Values,
    target: MutationTarget,
    columns: ReadonlyMap<string, ColumnMetadata>,
    keys: readonly PrimaryKeyMetadata[]
): ResolvedMutation {
    if (keys.length === 0) throw new Error('Save requires a primary key.');
    const supplied = bindings(values, columns);
    const byColumn = new Map(supplied.map(binding => [binding.column, binding]));
    const generated = keys.filter(key => key.generation !== 'none');
    const present = generated.filter(key => byColumn.has(key.columnName));
    const keyColumns = new Set(keys.map(key => key.columnName));
    const assignments = [...columns.values()].flatMap(column => {
        const binding = byColumn.get(column.columnName);
        return column.updatable && !keyColumns.has(column.columnName) && binding !== undefined ? [binding] : [];
    });

    if (present.length > 0) {
        const key = keys.map(column => {
            const binding = byColumn.get(column.columnName);
            if (binding === undefined) throw new Error('Save requires all primary-key values for an existing entity.');
            return binding;
        });
        if (assignments.length === 0) throw new Error('Save requires at least one updatable value for an existing entity.');
        return { ...target, kind: 'update', key, values: assignments };
    }

    for (const key of keys) {
        if (key.generation === 'none' && (!key.insertable || !byColumn.has(key.columnName))) {
            throw new Error(`Save requires an insertable value for primary key "${String(key.propertyKey)}".`);
        }
    }
    const insertValues = Object.fromEntries([...columns].flatMap(([name, column]) =>
        column.insertable && Object.hasOwn(values, name) ? [[name, values[name]]] : []
    ));
    const insert = insertBindings(insertValues, columns, keys);
    if (generated.length > 0) return { ...target, kind: 'insert', values: insert, primaryKeys: keys };
    return { ...target, kind: 'upsert', values: insert, conflictColumns: [...keyColumns], assignments };
}

function insertBindings(
    values: Values,
    columns: ReadonlyMap<string, ColumnMetadata>,
    keys: readonly PrimaryKeyMetadata[]
): Binding[] {
    const generated = new Set<ColumnMetadata>(keys.filter(key => key.generation !== 'none'));
    const writable = new Map([...columns].filter(([, column]) => column.insertable && !generated.has(column)));
    const result = bindings(values, writable);
    for (const [name, column] of writable) {
        if (Object.hasOwn(values, name)) continue;
        if (column.hasDefault) {
            result.push(bind(column, column.defaultValue));
        } else if (!column.nullable) {
            throw new Error(`Missing required insert property "${name}".`);
        }
    }
    return result;
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
