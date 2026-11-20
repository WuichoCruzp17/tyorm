import {
    and, avg, between, column, count, eq, gte, inList, like, literal, max, min,
    or, param, sum, type DatabaseConnection, type SelectQuery, type SqlCompiler
} from '@tyorm/core';
import { Department, Employee, resolver } from './models.js';

export const employeeQuery = {
    kind: 'select',
    from: { entity: Employee, alias: 'employee' },
    joins: [],
    orderBy: [],
    distinct: false
} satisfies Omit<SelectQuery, 'selections'>;

export async function showQueries(connection: DatabaseConnection, compiler: SqlCompiler) {
    async function show(label: string, query: SelectQuery, parameters?: Record<string, unknown>) {
        const compiled = compiler.compile(resolver.resolve(query), parameters);
        console.log(label, compiled.sql, compiled.parameters);
        console.table((await connection.execute(compiled)).rows);
    }

    const id = column('employee', 'id');
    const name = column('employee', 'name');
    const active = column('employee', 'active');

    await show('SELECT, DISTINCT, WHERE, ORDER BY y paginación', {
        ...employeeQuery,
        selections: [{ expression: name, alias: 'employeeName' }],
        distinct: true,
        where: and(
            eq(active, param('active')),
            or(like(name, param('prefix')), inList(id, [literal(2), literal(3)])),
            between(id, literal(1), literal(10))
        ),
        orderBy: [{ expression: name, direction: 'asc' }],
        limit: 2,
        offset: 0
    }, { active: true, prefix: 'A%' });

    await show('Relaciones directas: LEFT JOIN inverso con ON y OneToOne', {
        ...employeeQuery,
        from: { entity: Department, alias: 'department' },
        selections: [
            { expression: column('department', 'name'), alias: 'departmentName' },
            { expression: name, alias: 'employeeName' },
            { expression: column('profile', 'location') }
        ],
        joins: [
            {
                kind: 'join', type: 'left', sourceAlias: 'department',
                relation: 'employees', alias: 'employee',
                on: eq(active, param('active'))
            },
            { kind: 'join', type: 'left', sourceAlias: 'employee', relation: 'profile', alias: 'profile' }
        ],
        orderBy: [{ expression: column('department', 'id'), direction: 'asc' }, { expression: id, direction: 'asc' }]
    }, { active: true });

    const level = column('role', 'level');
    const totalRoles = count(column('role', 'id'));
    await show('ManyToMany, GROUP BY, agregados y HAVING', {
        ...employeeQuery,
        selections: [
            { expression: name, alias: 'employeeName' },
            { expression: count(), alias: 'rowsInGroup' },
            { expression: totalRoles, alias: 'roleCount' },
            { expression: sum(level), alias: 'levelSum' },
            { expression: avg(level), alias: 'levelAverage' },
            { expression: min(level), alias: 'levelMinimum' },
            { expression: max(level), alias: 'levelMaximum' }
        ],
        joins: [
            { kind: 'join', type: 'inner', sourceAlias: 'employee', relation: 'department', alias: 'department' },
            { kind: 'join', type: 'inner', sourceAlias: 'employee', relation: 'roles', alias: 'role' }
        ],
        groupBy: [id, name],
        having: gte(totalRoles, param('minimum')),
        orderBy: [{ expression: totalRoles, direction: 'desc' }, { expression: name, direction: 'asc' }]
    }, { minimum: 1 });

    await show('HAVING sobre un grupo global', {
        ...employeeQuery,
        selections: [{ expression: count(), alias: 'totalEmployees' }],
        having: gte(count(), param('minimum'))
    }, { minimum: 1 });
}
