import { describe, expect, it, vi } from 'vitest';
import {
    DataSource, Entity, PrimaryKey, column, type DatabaseConnection,
    type DatabaseDriver, type SelectQuery, type SqlCompiler
} from '../src';

@Entity({ name: 'users' })
class User {
    @PrimaryKey({ type: 'integer', name: 'user_id' })
    id!: number;
}

const query: SelectQuery = {
    kind: 'select',
    from: { entity: User, alias: 'u' },
    selections: [{ expression: column('u', 'id') }],
    joins: [],
    orderBy: [],
    distinct: false
};

function fixture() {
    const connection: DatabaseConnection = {
        async execute() { return { rows: [], affectedRows: 0 }; },
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
        isReleased: false
    };
    const execute = vi.spyOn(connection, 'execute');
    const driver = {
        name: 'test',
        connect: vi.fn<DatabaseDriver['connect']>().mockResolvedValue(undefined),
        disconnect: vi.fn<DatabaseDriver['disconnect']>().mockResolvedValue(undefined),
        acquireConnection: vi.fn<DatabaseDriver['acquireConnection']>().mockResolvedValue(connection),
        ping: vi.fn<DatabaseDriver['ping']>()
    } satisfies DatabaseDriver;
    const compiled = { sql: 'SELECT fixture', parameters: [] };
    const compile = vi.fn<SqlCompiler['compile']>().mockReturnValue(compiled);
    const selected = vi.fn(() => ({ driver, compiler: { compile } }));
    const other = vi.fn();
    const options = {
        type: 'test', database: 'fixture', entities: [User],
        providers: { test: selected, other }
    };
    return { connection, execute, driver, compiled, compile, selected, other, options };
}

describe('DataSource', () => {
    it('loads only the selected provider and releases the connection after executing', async () => {
        const { options, selected, other, driver, compile, compiled, connection, execute } = fixture();
        const source = await DataSource.connect(options);

        await expect(source.execute(query, { id: 1 })).resolves.toEqual({ rows: [], affectedRows: 0 });
        expect(selected).toHaveBeenCalledOnce();
        expect(other).not.toHaveBeenCalled();
        expect(driver.connect).toHaveBeenCalledExactlyOnceWith({ type: 'test', database: 'fixture' });
        expect(compile).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            columns: [expect.objectContaining({ columnName: 'user_id' })]
        }), { id: 1 });
        expect(execute).toHaveBeenCalledExactlyOnceWith(compiled);
        expect(connection.release).toHaveBeenCalledOnce();
        await source.close();
    });

    it('rejects a missing provider and preserves the cause of a provider load failure', async () => {
        const { options } = fixture();
        await expect(DataSource.connect({ ...options, type: 'missing' }))
            .rejects.toThrow('No driver provider configured for "missing".');

        const cause = new Error('Package is missing');
        await expect(DataSource.connect({
            ...options,
            providers: { test: async () => { throw cause; } }
        })).rejects.toMatchObject({ message: 'Could not load the driver provider for "test".', cause });
    });

    it('preserves connection and cleanup failures during startup', async () => {
        const { options, driver } = fixture();
        const original = new Error('Connection refused');
        const cleanup = new Error('Pool cleanup failed');
        driver.connect.mockRejectedValueOnce(original);
        driver.disconnect.mockRejectedValueOnce(cleanup);

        await expect(DataSource.connect(options)).rejects.toMatchObject({
            errors: [original, cleanup]
        });
        expect(driver.disconnect).toHaveBeenCalledOnce();
    });

    it('releases a failed query and preserves its original error', async () => {
        const { options, connection, execute } = fixture();
        const source = await DataSource.connect(options);
        const original = new Error('Query failed');
        execute.mockRejectedValueOnce(original);
        await expect(source.execute(query)).rejects.toBe(original);
        expect(connection.release).toHaveBeenCalledOnce();
        await source.close();
    });

    it('rejects repositories for entities outside the data source model', async () => {
        class Unregistered {}
        const { options, driver } = fixture();
        const source = await DataSource.connect(options);

        expect(() => source.getRepository(Unregistered)).toThrow('is not registered');
        expect(driver.acquireConnection).not.toHaveBeenCalled();
        await source.close();
    });

    it('closes once and rejects execution after closing begins', async () => {
        const { options, driver } = fixture();
        const source = await DataSource.connect(options);
        const close = source.close();

        expect(source.close()).toBe(close);
        await expect(source.execute(query)).rejects.toThrow('DataSource is closing or closed.');
        await close;
        expect(driver.disconnect).toHaveBeenCalledOnce();
        expect(driver.acquireConnection).not.toHaveBeenCalled();
    });
});
