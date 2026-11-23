import { Repository } from './repository';
import { createDecoratedRepository } from './repository-decorator';
import type { DatabaseDriver, DriverConfig, QueryResult, TransactionOptions } from './drivers';
import { TransactionManager } from './transactions';
import { getEntityMetadata } from './decorators';
import { OrmMetadataModel, type EntityTarget } from './metadata';
import { QuerySemanticResolver, resolveMutation, type CompiledQuery, type FunctionCall, type MutationQuery, type SelectQuery, type SqlCompiler } from './query';

export type DriverProvider = () =>
    | { readonly driver: DatabaseDriver; readonly compiler: SqlCompiler }
    | Promise<{ readonly driver: DatabaseDriver; readonly compiler: SqlCompiler }>;

export interface DataSourceOptions extends DriverConfig {
    readonly entities: readonly EntityTarget[];
    readonly providers: Readonly<Record<string, DriverProvider>>;
}

export interface TransactionScope {
    executeFunction(call: FunctionCall): Promise<QueryResult>;
    executeMutation(query: MutationQuery): Promise<QueryResult>;
    getRepository<Instance extends Repository<object>>(target: EntityTarget<Instance>): Instance;
    getRepository<Entity extends object>(target: EntityTarget<Entity>): Repository<Entity>;
}

type RepositoryScope = Pick<TransactionScope, 'getRepository'>;

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
        return this.repositoryScope(
            query => this.execute(query),
            query => this.executeMutation(query)
        ).getRepository(target);
    }

    async transaction<T>(
        callback: (scope: TransactionScope) => Promise<T>,
        options?: TransactionOptions
    ): Promise<T> {
        this.assertOpen();

        return new TransactionManager(this.driver).withContext(context => {
            const execute = async (compile: () => CompiledQuery): Promise<QueryResult> => {
                if (!context.isActive) {
                    throw new Error('TransactionContext is no longer active.');
                }
                return context.execute(compile());
            };
            const executeMutation = (query: MutationQuery) => execute(() => this.compileMutation(query));
            return callback({
                ...this.repositoryScope(
                    query => execute(() => this.compiler.compile(this.resolver.resolve(query))),
                    executeMutation
                ),
                executeMutation,
                executeFunction: call => execute(() => this.compileFunction(call))
            });
        }, options);
    }

    private repositoryScope(
        select: (query: SelectQuery) => Promise<QueryResult>,
        mutation: (query: MutationQuery) => Promise<QueryResult>
    ): RepositoryScope {
        const execute = Object.assign(select, { mutation });
        const model = this.model;

        function getRepository<Instance extends Repository<object>>(target: EntityTarget<Instance>): Instance;
        function getRepository<Entity extends object>(target: EntityTarget<Entity>): Repository<Entity>;
        function getRepository(target: EntityTarget): object {
            const custom = createDecoratedRepository(target, model, execute);
            if (custom !== undefined) {
                return custom;
            }
            if (target.prototype instanceof Repository) {
                throw new Error(`Repository "${target.name}" must declare @Repository.`);
            }
            return new Repository(model.getEntity(target).entity, execute);
        }

        return { getRepository };
    }

    async execute(
        query: SelectQuery,
        parameters?: Readonly<Record<string, unknown>>
    ): Promise<QueryResult> {
        this.assertOpen();

        return this.executeCompiled(this.compiler.compile(this.resolver.resolve(query), parameters));
    }

    async executeMutation(query: MutationQuery): Promise<QueryResult> {
        this.assertOpen();
        return this.executeCompiled(this.compileMutation(query));
    }

    async executeFunction(call: FunctionCall): Promise<QueryResult> {
        this.assertOpen();
        return this.executeCompiled(this.compileFunction(call));
    }

    private compileFunction(call: FunctionCall): CompiledQuery {
        if (this.compiler.compileFunction === undefined) {
            throw new Error('The selected driver does not support SQL function calls.');
        }
        return this.compiler.compileFunction(call);
    }

    private compileMutation(query: MutationQuery): CompiledQuery {
        if (this.compiler.compileMutation === undefined) {
            throw new Error('The selected driver does not support mutation queries.');
        }
        return this.compiler.compileMutation(resolveMutation(this.model, query));
    }

    private async executeCompiled(compiled: CompiledQuery): Promise<QueryResult> {
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

    private assertOpen(): void {
        if (this.closing !== undefined) {
            throw new Error('DataSource is closing or closed.');
        }
    }

    close(): Promise<void> {
        this.closing ??= Promise.resolve().then(() => this.driver.disconnect());
        return this.closing;
    }
}
