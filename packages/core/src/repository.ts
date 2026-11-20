import type { QueryResult } from './drivers';
import type { EntityMetadata } from './metadata';
import {
    and, column, count, eq, literal,
    type QueryPredicate, type QueryValue, type SelectItem, type SelectQuery
} from './query';

type KeyValue = NonNullable<QueryValue>;
type Property<Entity> = Extract<keyof Entity, string>;

export type RepositoryId<Entity> =
    | KeyValue
    | Readonly<Partial<Record<Property<Entity>, KeyValue>>>;

export interface FindAllOptions<Entity> {
    readonly orderBy?: Readonly<Partial<Record<Property<Entity>, 'asc' | 'desc'>>>;
    readonly where?: QueryPredicate;
    readonly limit?: number;
    readonly offset?: number;
}

const SOURCE_ALIAS = 'entity';
const COUNT_ALIAS = 'total';

export class Repository<
    Entity extends object,
    Id extends RepositoryId<Entity> = RepositoryId<Entity>
> {
    constructor(
        private readonly metadata: EntityMetadata<Entity>,
        private readonly execute: (query: SelectQuery) => Promise<QueryResult>
    ) {}

    async findById(id: Id): Promise<Entity | null> {
        const where = this.keyPredicate(id);
        const selections = this.entitySelections();
        const { rows } = await this.execute({ ...this.select(selections), where, limit: 1 });
        const row = rows[0];
        return row === undefined ? null : this.materialize(row, selections);
    }

    async findAll(options: FindAllOptions<Entity> = {}): Promise<Entity[]> {
        const selections = this.entitySelections();
        const orderBy = new Map<string, 'asc' | 'desc'>(Object.entries(options.orderBy ?? {}));
        for (const key of this.metadata.primaryKeys) {
            const property = this.propertyName(key.propertyKey);
            if (!orderBy.has(property)) {
                orderBy.set(property, 'asc');
            }
        }

        const { limit, offset, where } = options;
        const { rows } = await this.execute({
            ...this.select(selections),
            orderBy: [...orderBy].map(([property, direction]) => ({
                expression: column(SOURCE_ALIAS, property),
                direction
            })),
            ...(where === undefined ? {} : { where }),
            ...(limit === undefined ? {} : { limit }),
            ...(offset === undefined ? {} : { offset })
        });
        return rows.map(row => this.materialize(row, selections));
    }

    async existsById(id: Id): Promise<boolean> {
        const where = this.keyPredicate(id);
        const [key] = this.metadata.primaryKeys;
        if (key === undefined) {
            throw new Error('Repository requires a primary key.');
        }

        const selection = { expression: column(SOURCE_ALIAS, this.propertyName(key.propertyKey)) };
        const { rows } = await this.execute({ ...this.select([selection]), where, limit: 1 });
        return rows.length > 0;
    }

    async count(): Promise<bigint> {
        const { rows } = await this.execute(this.select([{ expression: count(), alias: COUNT_ALIAS }]));
        const value = rows[0]?.[COUNT_ALIAS];
        if (typeof value === 'bigint' && value >= 0n) {
            return value;
        }
        if (
            (typeof value === 'string' && /^\d+$/.test(value)) ||
            (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
        ) {
            return BigInt(value);
        }
        throw new Error('Invalid repository count returned by the driver.');
    }

    protected column(property: Property<Entity>): ReturnType<typeof column> {
        return column(SOURCE_ALIAS, property);
    }

    private keyPredicate(id: Id): QueryPredicate {
        const properties = this.metadata.primaryKeys.map(key => this.propertyName(key.propertyKey));
        const [first, ...rest] = properties;
        if (first === undefined) {
            throw new Error('Repository requires a primary key.');
        }
        if (rest.length === 0) {
            return this.keyComparison(first, id);
        }
        if (id === null || typeof id !== 'object' || Array.isArray(id)) {
            throw new Error('A composite repository ID requires an object with all primary-key properties.');
        }

        const components = new Map<string, unknown>(Object.entries(id));
        if (components.size !== properties.length || properties.some(property => !components.has(property))) {
            throw new Error('A composite repository ID requires exactly the primary-key properties.');
        }
        return and(...properties.map(property => this.keyComparison(property, components.get(property))));
    }

    private keyComparison(property: string, value: unknown): QueryPredicate {
        if (
            typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint' &&
            typeof value !== 'boolean' && !(value instanceof Date) && !(value instanceof Uint8Array)
        ) {
            throw new Error(`Invalid repository ID value for "${property}".`);
        }
        return eq(column(SOURCE_ALIAS, property), literal(value));
    }

    private propertyName(property: string | symbol): string {
        if (typeof property !== 'string') {
            throw new Error('Repository queries require string property names.');
        }
        return property;
    }

    private entitySelections() {
        return [...this.metadata.primaryKeys, ...this.metadata.columns].map(({ propertyKey }, index) => ({
            expression: column(SOURCE_ALIAS, this.propertyName(propertyKey)),
            alias: `field_${index}`
        }));
    }

    private materialize(row: Record<string, unknown>, selections: ReturnType<Repository<Entity, Id>['entitySelections']>): Entity {
        const entity: unknown = Object.create(this.metadata.target.prototype);
        if (!(entity instanceof this.metadata.target)) {
            throw new Error('Could not materialize repository entity.');
        }
        for (const { alias, expression } of selections) {
            if (!Object.hasOwn(row, alias)) {
                throw new Error(`Missing repository selection "${alias}" in query result.`);
            }

            Object.defineProperty(entity, expression.property, {
                value: row[alias],
                enumerable: true,
                configurable: true,
                writable: true
            });
        }
        return entity;
    }

    private select(selections: readonly SelectItem[]): SelectQuery {
        return {
            kind: 'select',
            from: { entity: this.metadata.target, alias: SOURCE_ALIAS },
            selections,
            joins: [],
            orderBy: [],
            distinct: false
        };
    }
}
