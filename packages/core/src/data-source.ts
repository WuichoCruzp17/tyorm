import { Repository } from './repository';
import { createDecoratedRepository } from './repository-decorator';
import type { DatabaseDriver, DriverConfig, QueryResult } from './drivers';
import { getEntityMetadata } from './decorators';
import { OrmMetadataModel, type EntityTarget } from './metadata';
import { QuerySemanticResolver, type SelectQuery, type SqlCompiler } from './query';

export type DriverProvider = () =>
    | { readonly driver: DatabaseDriver; readonly compiler: SqlCompiler }
    | Promise<{ readonly driver: DatabaseDriver; readonly compiler: SqlCompiler }>;

export interface DataSourceOptions extends DriverConfig {
    readonly entities: readonly EntityTarget[];
    readonly providers: Readonly<Record<string, DriverProvider>>;
}

export class DataSource {
    private closing: Promise<void> | undefined;

    private constructor(
        private readonly driver: DatabaseDriver,
        private readonly compiler: SqlCompiler,
        private readonly resolver: QuerySemanticResolver,
        private readonly model: OrmMetadataModel
    ) {}

    static async connect(options: DataSourceOptions): Promise<DataSource> {
        const { providers, entities, ...config } = options;
        const load = Object.hasOwn(providers, config.type) ? providers[config.type] : undefined;
        if (load === undefined) {
            throw new Error(`No driver provider configured for "${config.type}".`);
        }

        const model = new OrmMetadataModel(entities.map(entity => getEntityMetadata(entity)));
        const resolver = new QuerySemanticResolver(model);
        let provider: Awaited<ReturnType<DriverProvider>>;
        try {
            provider = await load();
        } catch (cause) {
            throw new Error(`Could not load the driver provider for "${config.type}".`, { cause });
        }

        const { driver, compiler } = provider;
        try {
            await driver.connect(config);
        } catch (error) {
            try {
                await driver.disconnect();
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'DataSource startup and cleanup failed.');
            }
            throw error;
        }

        return new DataSource(driver, compiler, resolver, model);
    }

    getRepository<Instance extends Repository<object>>(target: EntityTarget<Instance>): Instance;
    getRepository<Entity extends object>(target: EntityTarget<Entity>): Repository<Entity>;
    getRepository(target: EntityTarget): object {
        const execute = (query: SelectQuery) => this.execute(query);
        const custom = createDecoratedRepository(target, this.model, execute);
        if (custom !== undefined) {
            return custom;
        }
        if (target.prototype instanceof Repository) {
            throw new Error(`Repository "${target.name}" must declare @Repository.`);
        }
        return new Repository(this.model.getEntity(target).entity, execute);
    }

    async execute(
        query: SelectQuery,
        parameters?: Readonly<Record<string, unknown>>
    ): Promise<QueryResult> {
        if (this.closing !== undefined) {
            throw new Error('DataSource is closing or closed.');
        }

        const compiled = this.compiler.compile(this.resolver.resolve(query), parameters);
        const connection = await this.driver.acquireConnection();
        let result: QueryResult;
        try {
            result = await connection.execute(compiled);
        } catch (error) {
            try {
                await connection.release();
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'Query execution and connection release failed.');
            }
            throw error;
        }

        await connection.release();
        return result;
    }

    close(): Promise<void> {
        this.closing ??= Promise.resolve().then(() => this.driver.disconnect());
        return this.closing;
    }
}
