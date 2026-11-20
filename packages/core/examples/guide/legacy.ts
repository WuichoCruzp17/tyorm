import {
    Column, Entity, PrimaryKey, OrmMetadataModel, QuerySemanticResolver,
    column, getEntityMetadata, type DatabaseConnection, type SqlCompiler
} from '@tyorm/core';

// Este archivo se compila con experimentalDecorators: true.
@Entity({ schema: 'pg_temp', name: 'demo_employees' })
class LegacyEmployee {
    @PrimaryKey({ type: 'integer', name: 'employee_id' })
    id!: number;

    @Column({ type: 'string', name: 'display_name' })
    name!: string;
}

export async function showLegacy(connection: DatabaseConnection, compiler: SqlCompiler) {
    const resolver = new QuerySemanticResolver(new OrmMetadataModel([getEntityMetadata(LegacyEmployee)]));
    const query = resolver.resolve({
        kind: 'select',
        from: { entity: LegacyEmployee, alias: 'e' },
        selections: [{ expression: column('e', 'name'), alias: 'employeeName' }],
        joins: [],
        orderBy: [{ expression: column('e', 'id'), direction: 'asc' }],
        distinct: false
    });

    console.log('Consulta con una entidad decorada en modo legacy');
    console.table((await connection.execute(compiler.compile(query))).rows);
}
