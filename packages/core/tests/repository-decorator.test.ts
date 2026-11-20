import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
    Column, DataSource, Entity, PrimaryKey, ReadRepository, RepositoryDecorator as Repository,
    column, eq, literal, type DatabaseConnection, type DatabaseDriver, type SqlCompiler
} from '../src';

@Entity()
class User {
    @PrimaryKey({ type: 'uuid' })
    id!: string;

    @Column({ type: 'boolean' })
    active!: boolean;
}

@Repository(User)
class UserRepository extends ReadRepository<User, string> {
    findActive(): Promise<User[]> {
        return this.findAll({ where: eq(this.column('active'), literal(true)) });
    }
}

function connect(entities: readonly (typeof User)[] = [User]) {
    const connection: DatabaseConnection = {
        async execute() { return { rows: [], affectedRows: 0 }; },
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
        isReleased: false
    };
    const driver: DatabaseDriver = {
        name: 'test',
        connect: vi.fn(),
        disconnect: vi.fn(),
        acquireConnection: vi.fn().mockResolvedValue(connection),
        ping: vi.fn()
    };
    const compile = vi.fn<SqlCompiler['compile']>().mockReturnValue({
        sql: 'SELECT fixture',
        parameters: []
    });

    const dataSource = DataSource.connect({
        type: 'test',
        database: 'fixture',
        entities,
        providers: { test: () => ({ driver, compiler: { compile } }) }
    });
    return { dataSource, compile, connection };
}

describe('RepositoryDecorator', () => {
    it('creates the subclass with typed IDs, inherited reads and custom methods', async () => {
        const { dataSource, compile, connection } = connect();
        const source = await dataSource;
        try {
            const users = source.getRepository(UserRepository);
            expectTypeOf(users).toEqualTypeOf<UserRepository>();
            expectTypeOf(users.findById).parameter(0).toEqualTypeOf<string>();
            expect(users).toBeInstanceOf(UserRepository);

            await expect(users.findById('123e4567-e89b-12d3-a456-426614174000')).resolves.toBeNull();
            await expect(users.findActive()).resolves.toEqual([]);
            expect(compile).toHaveBeenLastCalledWith(expect.objectContaining({
                query: expect.objectContaining({ where: eq(column('entity', 'active'), literal(true)) })
            }), undefined);
            expect(connection.release).toHaveBeenCalledTimes(2);
        } finally {
            await source.close();
        }
    });

    it('requires the decorated entity to be registered', async () => {
        const { dataSource } = connect([]);
        const source = await dataSource;
        try {
            expect(() => source.getRepository(UserRepository)).toThrow('is not registered');
        } finally {
            await source.close();
        }
    });

    it('rejects a repository subclass without the decorator', async () => {
        class UndecoratedRepository extends ReadRepository<User> {}
        const { dataSource } = connect();
        const source = await dataSource;
        try {
            expect(() => source.getRepository(UndecoratedRepository)).toThrow('must declare @Repository');
        } finally {
            await source.close();
        }
    });
});
