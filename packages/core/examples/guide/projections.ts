import {
    column, count, defineRecord, executeDtoQuery, executeProjectionQuery, executeRecordQuery,
    type DatabaseConnection, type SqlCompiler
} from '@tyorm/core';
import { resolver } from './models.js';
import { employeeQuery } from './queries.js';

class EmployeeSummary {
    constructor(readonly name: string, readonly roles: bigint) {}
}

const employeeRecord = defineRecord({
    name: value => {
        if (typeof value !== 'string') throw new TypeError('Se esperaba un nombre.');
        return value;
    },
    roles: value => {
        if (typeof value !== 'string') throw new TypeError('Se esperaba un COUNT de PostgreSQL.');
        return BigInt(value);
    }
});

export async function showProjections(connection: DatabaseConnection, compiler: SqlCompiler) {
    const name = column('employee', 'name');
    const query = {
        ...employeeQuery,
        joins: [{
            kind: 'join', type: 'left', sourceAlias: 'employee', relation: 'roles', alias: 'role'
        }],
        groupBy: [column('employee', 'id'), name],
        orderBy: [{ expression: name, direction: 'asc' }]
    } as const;
    const select = { name, roles: count(column('role', 'id')) };

    console.log('Proyección automática (valores del driver)');
    console.table(await executeProjectionQuery(connection, resolver, compiler, query, select));

    const summaries = await executeDtoQuery(connection, resolver, compiler, query, {
        select,
        map: row => new EmployeeSummary(employeeRecord.name(row.name), employeeRecord.roles(row.roles))
    });
    console.log('DTO explícitos');
    console.table(summaries);

    console.log('Esquema record reutilizado con dos selecciones');
    console.table(await executeRecordQuery(connection, resolver, compiler, query, employeeRecord, select));
    // Aquí COUNT(*) incluye la fila del LEFT JOIN aunque el empleado no tenga roles.
    console.table(await executeRecordQuery(connection, resolver, compiler, query, employeeRecord, {
        name,
        roles: count()
    }));
}
