import { describe, expect, it, vi } from 'vitest';
import {
    Column, Entity, PrimaryKey, Repository, and, column, count, eq, getEntityMetadata,
    literal, type QueryResult, type SelectQuery
} from '../src';

@Entity({ name: 'employees' })
class Employee {
    @PrimaryKey({ type: 'integer', name: 'employee_id' })
    id!: number;

    @Column({ type: 'string', name: 'display_name', nullable: true })
    name!: string | null;

    constructor() {
        throw new Error('The repository must not call this constructor.');
    }
}

@Entity()
class Membership {
    @PrimaryKey({ type: 'integer' })
    teamId!: number;

    @PrimaryKey({ type: 'integer' })
    userId!: number;
}

function executor(rows: Record<string, unknown>[]) {
    return vi.fn<(query: SelectQuery) => Promise<QueryResult>>()
        .mockResolvedValue({ rows, affectedRows: rows.length });
}

describe('Repository', () => {
    it('finds an entity by a bound key and materializes scalar properties', async () => {
        const execute = executor([{ field_0: 9, field_1: null }]);
        const repository = new Repository(getEntityMetadata(Employee), execute);

        const row = await repository.findById(9);
        expect(row).toBeInstanceOf(Employee);
        expect(row).toMatchObject({ id: 9, name: null });
        expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            limit: 1,
            where: eq(column('entity', 'id'), literal(9))
        }));
    });

    it('returns null, an empty list, and false for missing rows', async () => {
        const repository = new Repository(getEntityMetadata(Employee), executor([]));

        await expect(repository.findById(9)).resolves.toBeNull();
        await expect(repository.findAll()).resolves.toEqual([]);
        await expect(repository.existsById(9)).resolves.toBe(false);
    });

    it('queries all composite key components and rejects an incomplete key', async () => {
        const execute = executor([{ teamId: 4 }]);
        const repository = new Repository(getEntityMetadata(Membership), execute);

        await expect(repository.existsById({ userId: 1, teamId: 4 })).resolves.toBe(true);
        expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            limit: 1,
            where: and(
                eq(column('entity', 'teamId'), literal(4)),
                eq(column('entity', 'userId'), literal(1))
            )
        }));
        await expect(repository.findById({ teamId: 4 })).rejects.toThrow('exactly the primary-key properties');
        expect(execute).toHaveBeenCalledOnce();
    });

    it('adds key ordering as a tie-breaker and passes pagination through', async () => {
        const execute = executor([]);
        const repository = new Repository(getEntityMetadata(Employee), execute);

        await repository.findAll({ orderBy: { name: 'desc' }, limit: 0, offset: 2 });
        expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            orderBy: [
                { expression: column('entity', 'name'), direction: 'desc' },
                { expression: column('entity', 'id'), direction: 'asc' }
            ],
            limit: 0,
            offset: 2
        }));
    });

    it('converts count values without loss and rejects an unsafe numeric result', async () => {
        const execute = executor([{ total: '9007199254740993' }]);
        const repository = new Repository(getEntityMetadata(Employee), execute);

        await expect(repository.count()).resolves.toBe(9007199254740993n);
        expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            selections: [{ expression: count(), alias: 'total' }]
        }));
        execute.mockResolvedValueOnce({ rows: [{ total: Number.MAX_SAFE_INTEGER + 1 }], affectedRows: 1 });
        await expect(repository.count()).rejects.toThrow('Invalid repository count');
    });

    it('rejects a driver row with a missing projected alias', async () => {
        const repository = new Repository(getEntityMetadata(Employee), executor([{ field_0: 9 }]));

        await expect(repository.findById(9)).rejects.toThrow('Missing repository selection "field_1"');
    });
});
