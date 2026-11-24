import {
    DataSource,
    column,
    eq,
    param
} from '@tyorm/core';
import { expect, it } from 'vitest';
import { mysqlProvider } from '../src';
import {
    Badge,
    Department,
    Employee,
    Role
} from './relation-joins.fixture';

const database = process.env.MYSQL_TEST_DATABASE;

it.skipIf(!database)('executes direct, inverse, junction, and chained relationship joins on MySQL', async () => {
    if (!database) throw new Error('MYSQL_TEST_DATABASE is required.');

    const { driver, compiler } = await mysqlProvider();
    const password = process.env.MYSQL_TEST_PASSWORD;
    const connect = driver.connect.bind(driver);
    driver.connect = async options => {
        await connect(options);
        const connection = await driver.acquireConnection();
        try {
            for (const sql of [
                'CREATE TEMPORARY TABLE join_departments (department_id INT NOT NULL, region_id INT NOT NULL, department_name VARCHAR(50) NOT NULL, PRIMARY KEY (department_id, region_id))',
                'CREATE TEMPORARY TABLE join_employees (employee_id VARCHAR(20) NOT NULL, tenant_id INT NOT NULL, employee_name VARCHAR(50) NOT NULL, department_fk INT NULL, region_fk INT NULL, badge_fk INT NULL, PRIMARY KEY (employee_id, tenant_id), UNIQUE KEY employee_badge_unique (badge_fk))',
                'CREATE TEMPORARY TABLE join_badges (badge_id INT PRIMARY KEY, badge_label VARCHAR(50) NOT NULL)',
                'CREATE TEMPORARY TABLE join_roles (role_id INT PRIMARY KEY, role_name VARCHAR(50) NOT NULL)',
                'CREATE TEMPORARY TABLE employee_roles (employee_fk VARCHAR(20) NOT NULL, tenant_fk INT NOT NULL, role_fk INT NOT NULL, PRIMARY KEY (employee_fk, tenant_fk, role_fk))',
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
        type: 'mysql',
        database,
        host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
        username: process.env.MYSQL_TEST_USER ?? '',
        ...(password === undefined ? {} : { password }),
        pool: { max: 1 },
        entities: [Department, Employee, Badge, Role],
        providers: { mysql: () => ({ driver, compiler }) }
    });

    try {
        const manyToOne = await source.execute({
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
            where: eq(column('d', 'id'), param('departmentId')),
            orderBy: [],
            distinct: false
        }, { departmentId: 10 });
        expect(manyToOne.rows).toEqual([{ employee: 'Ada', department: 'Engineering' }]);

        const inverseOneToMany = await source.execute({
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
        expect(inverseOneToMany.rows).toEqual([
            { department: 'Engineering', employee: 'Ada' },
            { department: 'Sales', employee: null },
            { department: 'Empty', employee: null }
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
        expect(inverseOneToOne.rows).toEqual([{ badge: 'Gold', employee: 'Ada' }]);

        const owningManyToMany = await source.execute({
            kind: 'select',
            from: { entity: Employee, alias: 'e' },
            selections: [
                { expression: column('e', 'name'), alias: 'employee' },
                { expression: column('r', 'name'), alias: 'role' }
            ],
            joins: [{
                kind: 'join',
                type: 'inner',
                sourceAlias: 'e',
                relation: 'roles',
                alias: 'r'
            }],
            where: eq(column('e', 'id'), param('employeeId')),
            orderBy: [{ expression: column('r', 'id'), direction: 'asc' }],
            distinct: false
        }, { employeeId: 'u1' });
        expect(owningManyToMany.rows).toEqual([
            { employee: 'Ada', role: 'admin' },
            { employee: 'Ada', role: 'reader' }
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
