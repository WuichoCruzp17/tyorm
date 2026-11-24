import {
    DataSource,
    column,
    eq,
    param,
    type SelectQuery
} from '@tyorm/core';
import { expect, it } from 'vitest';
import { sqliteProvider } from '../src';
import { SQLiteSelectCompiler } from '../src/query/compiler/sqlite-select-compiler';
import {
    Badge,
    createRelationResolver,
    Department,
    Employee,
    Role
} from './relation-joins.fixture';

const resolver = createRelationResolver();
const compiler = new SQLiteSelectCompiler();

function resolve(query: SelectQuery, parameters: Readonly<Record<string, unknown>> = {}) {
    return compiler.compile(resolver.resolve(query), parameters);
}

it('compiles inverse one-to-many joins with composite keys and binds ON before WHERE and pagination', () => {
    expect(resolve({
        kind: 'select',
        from: { entity: Department, alias: 'd' },
        selections: [{ expression: column('e', 'name') }],
        joins: [{
            kind: 'join',
            type: 'left',
            sourceAlias: 'd',
            relation: 'employees',
            alias: 'e',
            on: eq(column('e', 'name'), param('employeeName'))
        }],
        where: eq(column('d', 'id'), param('departmentId')),
        orderBy: [{ expression: column('e', 'name'), direction: 'asc' }],
        limit: 5,
        offset: 2,
        distinct: false
    }, { employeeName: 'Ada', departmentId: 10 })).toEqual({
        sql: 'SELECT "e"."employee_name" FROM "join_departments" AS "d" ' +
            'LEFT JOIN "join_employees" AS "e" ON "d"."department_id" = "e"."department_fk" ' +
            'AND "d"."region_id" = "e"."region_fk" AND ("e"."employee_name" = ?) ' +
            'WHERE "d"."department_id" = ? ORDER BY "e"."employee_name" ASC LIMIT ? OFFSET ?',
        parameters: ['Ada', 10, 5, 2]
    });
});

it('compiles an owning many-to-one join using the source foreign-key columns', () => {
    expect(resolve({
        kind: 'select',
        from: { entity: Employee, alias: 'e' },
        selections: [{ expression: column('d', 'name') }],
        joins: [{
            kind: 'join',
            type: 'inner',
            sourceAlias: 'e',
            relation: 'department',
            alias: 'd'
        }],
        orderBy: [],
        distinct: false
    })).toEqual({
        sql: 'SELECT "d"."department_name" FROM "join_employees" AS "e" ' +
            'INNER JOIN "join_departments" AS "d" ' +
            'ON "e"."department_fk" = "d"."department_id" ' +
            'AND "e"."region_fk" = "d"."region_id"',
        parameters: []
    });
});

it('compiles owning and inverse one-to-one joins', () => {
    const owning = resolve({
        kind: 'select',
        from: { entity: Employee, alias: 'e' },
        selections: [{ expression: column('b', 'label') }],
        joins: [{
            kind: 'join', type: 'left', sourceAlias: 'e', relation: 'badge', alias: 'b'
        }],
        orderBy: [],
        distinct: false
    });
    const inverse = resolve({
        kind: 'select',
        from: { entity: Badge, alias: 'b' },
        selections: [{ expression: column('e', 'name') }],
        joins: [{
            kind: 'join', type: 'left', sourceAlias: 'b', relation: 'employee', alias: 'e'
        }],
        orderBy: [],
        distinct: false
    });

    expect(owning.sql).toContain(
        'LEFT JOIN "join_badges" AS "b" ON "e"."badge_fk" = "b"."badge_id"'
    );
    expect(inverse.sql).toContain(
        'LEFT JOIN "join_employees" AS "e" ON "b"."badge_id" = "e"."badge_fk"'
    );
});

it('compiles owning and inverse many-to-many joins over composite junction keys', () => {
    const owning = resolve({
        kind: 'select',
        from: { entity: Employee, alias: 'e' },
        selections: [{ expression: column('r', 'name') }],
        joins: [{
            kind: 'join',
            type: 'inner',
            sourceAlias: 'e',
            relation: 'roles',
            alias: 'r',
            on: eq(column('r', 'name'), param('roleName'))
        }],
        where: eq(column('e', 'id'), param('employeeId')),
        orderBy: [],
        distinct: false
    }, { roleName: 'admin', employeeId: 'u1' });
    const inverse = resolve({
        kind: 'select',
        from: { entity: Role, alias: 'r' },
        selections: [{ expression: column('e', 'name') }],
        joins: [{
            kind: 'join',
            type: 'left',
            sourceAlias: 'r',
            relation: 'employees',
            alias: 'e'
        }],
        orderBy: [],
        distinct: false
    });

    expect(owning).toEqual({
        sql: 'SELECT "r"."role_name" FROM "join_employees" AS "e" ' +
            'INNER JOIN "employee_roles" AS "__tyorm_junction_0" ' +
            'ON "e"."employee_id" = "__tyorm_junction_0"."employee_fk" ' +
            'AND "e"."tenant_id" = "__tyorm_junction_0"."tenant_fk" ' +
            'INNER JOIN "join_roles" AS "r" ' +
            'ON "__tyorm_junction_0"."role_fk" = "r"."role_id" ' +
            'AND ("r"."role_name" = ?) WHERE "e"."employee_id" = ?',
        parameters: ['admin', 'u1']
    });
    expect(inverse.sql).toContain(
        'LEFT JOIN "employee_roles" AS "__tyorm_junction_0" ' +
        'ON "r"."role_id" = "__tyorm_junction_0"."role_fk"'
    );
    expect(inverse.sql).toContain(
        'LEFT JOIN "join_employees" AS "e" ' +
        'ON "__tyorm_junction_0"."employee_fk" = "e"."employee_id" ' +
        'AND "__tyorm_junction_0"."tenant_fk" = "e"."tenant_id"'
    );
});

it('executes inverse, owner, and chained relationship joins in in-memory SQLite', async () => {
    const { driver, compiler: providerCompiler } = await sqliteProvider();
    const connect = driver.connect.bind(driver);
    driver.connect = async options => {
        await connect(options);
        const connection = await driver.acquireConnection();
        try {
            for (const sql of [
                'CREATE TABLE join_departments (department_id INTEGER NOT NULL, region_id INTEGER NOT NULL, department_name TEXT NOT NULL, PRIMARY KEY (department_id, region_id))',
                'CREATE TABLE join_employees (employee_id TEXT NOT NULL, tenant_id INTEGER NOT NULL, employee_name TEXT NOT NULL, department_fk INTEGER, region_fk INTEGER, badge_fk INTEGER, PRIMARY KEY (employee_id, tenant_id))',
                'CREATE TABLE join_badges (badge_id INTEGER PRIMARY KEY, badge_label TEXT NOT NULL)',
                'CREATE TABLE join_roles (role_id INTEGER PRIMARY KEY, role_name TEXT NOT NULL)',
                'CREATE TABLE employee_roles (employee_fk TEXT NOT NULL, tenant_fk INTEGER NOT NULL, role_fk INTEGER NOT NULL, PRIMARY KEY (employee_fk, tenant_fk, role_fk))',
                "INSERT INTO join_departments VALUES (10, 1, 'Engineering'), (20, 1, 'Sales'), (30, 1, 'Empty')",
                "INSERT INTO join_employees VALUES ('u1', 7, 'Ada', 10, 1, 100), ('u2', 7, 'Lin', 20, 1, NULL)",
                "INSERT INTO join_badges VALUES (100, 'Gold')",
                "INSERT INTO join_roles VALUES (1, 'admin'), (2, 'reader'), (3, 'unused')",
                "INSERT INTO employee_roles VALUES ('u1', 7, 1), ('u1', 7, 2), ('u2', 7, 2)"
            ]) {
                await connection.execute({ sql });
            }
        } finally {
            await connection.release();
        }
    };

    const source = await DataSource.connect({
        type: 'sqlite',
        database: ':memory:',
        entities: [Department, Employee, Badge, Role],
        providers: { sqlite: async () => ({ driver, compiler: providerCompiler }) }
    });

    try {
        const owningManyToOne = await source.execute({
            kind: 'select',
            from: { entity: Employee, alias: 'e' },
            selections: [
                { expression: column('e', 'name'), alias: 'employee' },
                { expression: column('d', 'name'), alias: 'department' }
            ],
            joins: [{
                kind: 'join',
                type: 'inner',
                sourceAlias: 'e',
                relation: 'department',
                alias: 'd'
            }],
            where: eq(column('e', 'id'), param('employeeId')),
            orderBy: [],
            distinct: false
        }, { employeeId: 'u1' });
        expect(owningManyToOne.rows).toEqual([
            { employee: 'Ada', department: 'Engineering' }
        ]);

        const inverseDirect = await source.execute({
            kind: 'select',
            from: { entity: Department, alias: 'd' },
            selections: [
                { expression: column('d', 'name'), alias: 'department' },
                { expression: column('e', 'name'), alias: 'employee' }
            ],
            joins: [{
                kind: 'join',
                type: 'left',
                sourceAlias: 'd',
                relation: 'employees',
                alias: 'e',
                on: eq(column('e', 'name'), param('employeeName'))
            }],
            where: eq(column('d', 'regionId'), param('regionId')),
            orderBy: [{ expression: column('d', 'id'), direction: 'asc' }],
            distinct: false
        }, { employeeName: 'Ada', regionId: 1 });
        expect(inverseDirect.rows).toEqual([
            { department: 'Engineering', employee: 'Ada' },
            { department: 'Sales', employee: null },
            { department: 'Empty', employee: null }
        ]);

        const owningOneToOne = await source.execute({
            kind: 'select',
            from: { entity: Employee, alias: 'e' },
            selections: [
                { expression: column('e', 'name'), alias: 'employee' },
                { expression: column('b', 'label'), alias: 'badge' }
            ],
            joins: [{
                kind: 'join', type: 'left', sourceAlias: 'e', relation: 'badge', alias: 'b'
            }],
            orderBy: [{ expression: column('e', 'id'), direction: 'asc' }],
            distinct: false
        });
        expect(owningOneToOne.rows).toEqual([
            { employee: 'Ada', badge: 'Gold' },
            { employee: 'Lin', badge: null }
        ]);

        const inverseOneToOne = await source.execute({
            kind: 'select',
            from: { entity: Badge, alias: 'b' },
            selections: [
                { expression: column('b', 'label'), alias: 'badge' },
                { expression: column('e', 'name'), alias: 'employee' }
            ],
            joins: [{
                kind: 'join', type: 'left', sourceAlias: 'b', relation: 'employee', alias: 'e'
            }],
            orderBy: [{ expression: column('b', 'id'), direction: 'asc' }],
            distinct: false
        });
        expect(inverseOneToOne.rows).toEqual([
            { badge: 'Gold', employee: 'Ada' }
        ]);

        const inverseManyToMany = await source.execute({
            kind: 'select',
            from: { entity: Role, alias: 'r' },
            selections: [
                { expression: column('r', 'name'), alias: 'role' },
                { expression: column('e', 'name'), alias: 'employee' }
            ],
            joins: [{
                kind: 'join', type: 'left', sourceAlias: 'r', relation: 'employees', alias: 'e'
            }],
            orderBy: [
                { expression: column('r', 'id'), direction: 'asc' },
                { expression: column('e', 'id'), direction: 'asc' }
            ],
            distinct: false
        });
        expect(inverseManyToMany.rows).toEqual([
            { role: 'admin', employee: 'Ada' },
            { role: 'reader', employee: 'Ada' },
            { role: 'reader', employee: 'Lin' },
            { role: 'unused', employee: null }
        ]);

        const chained = await source.execute({
            kind: 'select',
            from: { entity: Department, alias: 'd' },
            selections: [
                { expression: column('d', 'name'), alias: 'department' },
                { expression: column('r', 'name'), alias: 'role' }
            ],
            joins: [
                {
                    kind: 'join',
                    type: 'left',
                    sourceAlias: 'd',
                    relation: 'employees',
                    alias: 'e'
                },
                {
                    kind: 'join',
                    type: 'left',
                    sourceAlias: 'e',
                    relation: 'roles',
                    alias: 'r',
                    on: eq(column('r', 'name'), param('roleName'))
                }
            ],
            where: eq(column('d', 'regionId'), param('regionId')),
            orderBy: [
                { expression: column('d', 'id'), direction: 'asc' },
                { expression: column('r', 'id'), direction: 'asc' }
            ],
            distinct: false
        }, { roleName: 'admin', regionId: 1 });
        expect(chained.rows).toEqual([
            { department: 'Engineering', role: null },
            { department: 'Engineering', role: 'admin' },
            { department: 'Sales', role: null },
            { department: 'Empty', role: null }
        ]);
    } finally {
        await source.close();
    }
});
