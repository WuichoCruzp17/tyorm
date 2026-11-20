import { describe, expect, it } from 'vitest';
import {
    column,
    count,
    gte,
    param,
    sum,
    Column,
    Entity,
    executeDtoQuery,
    executeProjectionQuery,
    defineRecord,
    executeRecordQuery,
    getEntityMetadata,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    OrmMetadataModel,
    PrimaryKey,
    QuerySemanticResolver,
    type SelectQuery
} from '@tyorm/core';
import { PostgreSQLDriver, PostgresSelectCompiler } from '../src/index';

@Entity({ name: 'join_departments', schema: 'pg_temp' })
class Department {
    @PrimaryKey({ type: 'integer', name: 'department_id' })
    id!: number;

    @Column({ type: 'string' })
    region!: string;

    @OneToMany(() => User, 'department')
    users!: User[];
}

@Entity({ name: 'join_roles', schema: 'pg_temp' })
class Role {
    @PrimaryKey({ type: 'integer', name: 'role_id' })
    id!: number;

    @Column({ type: 'boolean' })
    enabled!: boolean;
}

@Entity({ name: 'join_users', schema: 'pg_temp' })
class User {
    @PrimaryKey({ type: 'integer', name: 'user_id' })
    id!: number;

    @PrimaryKey({ type: 'integer', name: 'tenant_id' })
    tenantId!: number;

    @ManyToOne(() => Department, 'users')
    @JoinColumn({ name: 'department_fk', referencedColumnName: 'department_id' })
    department!: Department;

    @ManyToMany(() => Role)
    @JoinTable({
        name: 'join_user_roles',
        schema: 'pg_temp',
        joinColumns: [
            { name: 'user_fk', referencedColumnName: 'user_id' },
            { name: 'tenant_fk', referencedColumnName: 'tenant_id' }
        ],
        inverseJoinColumns: [{ name: 'role_fk', referencedColumnName: 'role_id' }]
    })
    roles!: Role[];
}

const resolver = new QuerySemanticResolver(new OrmMetadataModel([
    getEntityMetadata(Department),
    getEntityMetadata(User),
    getEntityMetadata(Role)
]));
const compiler = new PostgresSelectCompiler();

const query: SelectQuery = {
    kind: 'select',
    from: { entity: Department, alias: '__tyorm_junction_0' },
    selections: [
        { expression: column('u', 'id') },
        { expression: column('r', 'id') }
    ],
    joins: [
        {
            kind: 'join',
            type: 'inner',
            sourceAlias: '__tyorm_junction_0',
            relation: 'users',
            alias: 'u',
            on: {
                kind: 'comparison',
                operator: 'eq',
                left: column('__tyorm_junction_0', 'region'),
                right: { kind: 'parameter', name: 'region' }
            }
        },
        {
            kind: 'join',
            type: 'inner',
            sourceAlias: 'u',
            relation: 'roles',
            alias: 'r',
            on: {
                kind: 'comparison',
                operator: 'eq',
                left: column('r', 'enabled'),
                right: { kind: 'parameter', name: 'enabled' }
            }
        }
    ],
    where: {
        kind: 'comparison',
        operator: 'eq',
        left: column('u', 'tenantId'),
        right: { kind: 'parameter', name: 'tenant' }
    },
    orderBy: [{ expression: column('r', 'id'), direction: 'desc' }],
    limit: 1,
    offset: 1,
    distinct: false
};

describe('PostgreSQL chained JOINs', () => {
    it('executes direct and junction JOINs with filters, ordering and pagination', async () => {
        const compiled = compiler.compile(resolver.resolve(query), {
            region: 'north',
            enabled: true,
            tenant: 1
        });
        expect(compiled.parameters).toEqual(['north', true, 1, 1, 1]);

        const driver = new PostgreSQLDriver();
        const password = process.env.PGPASSWORD;
        await driver.connect({
            type: 'postgres',
            host: process.env.PGHOST ?? 'localhost',
            port: Number(process.env.PGPORT ?? 5432),
            database: process.env.PGDATABASE ?? 'tyorm_test',
            username: process.env.PGUSER ?? 'postgres',
            ...(password !== undefined ? { password } : {})
        });

        try {
            const connection = await driver.acquireConnection();
            try {
                await connection.beginTransaction();

                await connection.execute({
                    sql: `CREATE TEMP TABLE join_departments (
                        department_id integer PRIMARY KEY, region text NOT NULL
                    )`
                });
                await connection.execute({
                    sql: `CREATE TEMP TABLE join_roles (
                        role_id integer PRIMARY KEY, enabled boolean NOT NULL
                    )`
                });
                await connection.execute({
                    sql: `CREATE TEMP TABLE join_users (
                        user_id integer, tenant_id integer,
                        department_fk integer NOT NULL REFERENCES pg_temp.join_departments,
                        PRIMARY KEY (user_id, tenant_id)
                    )`
                });
                await connection.execute({
                    sql: `CREATE TEMP TABLE join_user_roles (
                        user_fk integer, tenant_fk integer,
                        role_fk integer REFERENCES pg_temp.join_roles,
                        PRIMARY KEY (user_fk, tenant_fk, role_fk),
                        FOREIGN KEY (user_fk, tenant_fk) REFERENCES pg_temp.join_users
                    )`
                });
                await connection.execute({
                    sql: 'INSERT INTO pg_temp.join_departments VALUES (1, $1), (2, $2)',
                    parameters: ['north', 'south']
                });
                await connection.execute({
                    sql: 'INSERT INTO pg_temp.join_roles VALUES ' +
                        '(100, true), (200, true), (300, true), (400, false), ' +
                        '(500, true), (600, true), (700, true)'
                });
                await connection.execute({
                    sql: 'INSERT INTO pg_temp.join_users VALUES (10, 1, 1), ' +
                        '(10, 2, 1), (20, 1, 2), (30, 2, 1)'
                });
                await connection.execute({
                    sql: 'INSERT INTO pg_temp.join_user_roles VALUES ' +
                        '(10, 1, 100), (10, 1, 200), (10, 1, 300), (10, 1, 400), ' +
                        '(10, 2, 500), (20, 1, 600), (30, 2, 700)'
                });

                const result = await connection.execute(compiled);
                expect(result.rows).toEqual([{ user_id: 10, role_id: 200 }]);
                const userId = column('u', 'id');
                const roleEnabled = column('r', 'enabled');
                const grouped = resolver.resolve({
                    ...query,
                    selections: [{ expression: userId }],
                    groupBy: [userId, roleEnabled],
                    having: {
                        kind: 'comparison',
                        operator: 'gte',
                        left: userId,
                        right: { kind: 'parameter', name: 'minimumUserId' }
                    },
                    orderBy: [{ expression: userId, direction: 'asc' }],
                    limit: 2,
                    offset: 0
                });
                const groupingParameters = { region: 'north', enabled: true, tenant: 1 };
                const groups = await connection.execute(compiler.compile(grouped, {
                    ...groupingParameters,
                    minimumUserId: 10
                }));
                expect(groups.rows).toEqual([{ user_id: 10 }]);

                const filteredGroups = await connection.execute(compiler.compile(grouped, {
                    ...groupingParameters,
                    minimumUserId: 11
                }));
                expect(filteredGroups.rows).toEqual([]);

                const roleCount = count(column('r', 'id'));
                const totals = resolver.resolve({
                    ...query,
                    selections: [
                        { expression: userId },
                        { expression: roleCount, alias: 'role_count' },
                        { expression: sum(column('r', 'id')), alias: 'role_sum' }
                    ],
                    groupBy: [userId],
                    having: gte(roleCount, param('minimumRoles')),
                    orderBy: [{ expression: roleCount, direction: 'desc' }],
                    offset: 0
                });
                const matching = await connection.execute(compiler.compile(totals, {
                    ...groupingParameters,
                    minimumRoles: 3
                }));
                expect(matching.rows).toEqual([
                    { user_id: 10, role_count: '3', role_sum: '600' }
                ]);

                const aboveCount = await connection.execute(compiler.compile(totals, {
                    ...groupingParameters,
                    minimumRoles: 4
                }));
                expect(aboveCount.rows).toEqual([]);

                class UserRoleSummary {
                    constructor(
                        readonly userId: number,
                        readonly totalRoles: bigint
                    ) { }
                }

                const summaries = await executeDtoQuery(
                    connection,
                    resolver,
                    compiler,
                    totals.query,
                    {
                        select: { memberId: userId, roleCount },
                        map: ({ memberId, roleCount }) => {
                            if (typeof memberId !== 'number' || typeof roleCount !== 'string') {
                                throw new TypeError('Unexpected role summary values.');
                            }
                            return new UserRoleSummary(memberId, BigInt(roleCount));
                        }
                    },
                    { ...groupingParameters, minimumRoles: 3 }
                );
                expect(summaries).toEqual([new UserRoleSummary(10, 3n)]);
                expect(summaries[0]).toBeInstanceOf(UserRoleSummary);

                const projected = await executeProjectionQuery(
                    connection,
                    resolver,
                    compiler,
                    totals.query,
                    { memberId: userId, roleCount },
                    { ...groupingParameters, minimumRoles: 3 }
                );
                expect(projected).toEqual([{ memberId: 10, roleCount: '3' }]);

                const summaryRecord = defineRecord({
                    memberId: value => {
                        if (typeof value !== 'number') {
                            throw new TypeError('Expected a numeric member ID.');
                        }
                        return value;
                    },
                    roleCount: value => {
                        if (typeof value !== 'string') {
                            throw new TypeError('Expected a PostgreSQL COUNT string.');
                        }
                        return BigInt(value);
                    }
                });
                const records = await executeRecordQuery(
                    connection,
                    resolver,
                    compiler,
                    totals.query,
                    summaryRecord,
                    { memberId: userId, roleCount },
                    { ...groupingParameters, minimumRoles: 3 }
                );
                expect(records).toEqual([{ memberId: 10, roleCount: 3n }]);

                await connection.rollback();
            } finally {
                await connection.release();
            }
        } finally {
            await driver.disconnect();
        }
    });

    it('rejects a reference to an undeclared alias in a JOIN predicate', () => {
        const invalidQuery: SelectQuery = {
            ...query,
            joins: query.joins.map(join => join.alias === 'r'
                ? {
                    ...join,
                    on: {
                        kind: 'comparison',
                        operator: 'eq',
                        left: column('missing', 'enabled'),
                        right: { kind: 'parameter', name: 'enabled' }
                    }
                }
                : join)
        };

        expect(() => resolver.resolve(invalidQuery))
            .toThrow('Unknown column alias: missing.');
    });

    it('rejects an omitted parameter in the junction target predicate', () => {
        const resolved = resolver.resolve(query);
        expect(() => compiler.compile(resolved, { region: 'north', tenant: 1 }))
            .toThrow('Missing query parameter "enabled".');
    });
});
