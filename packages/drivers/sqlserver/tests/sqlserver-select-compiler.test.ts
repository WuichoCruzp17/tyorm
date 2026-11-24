import {
    Column,
    count,
    Entity,
    getEntityMetadata,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OrmMetadataModel,
    OneToMany,
    PrimaryKey,
    QuerySemanticResolver,
    column,
    eq,
    param,
    type SelectQuery
} from '@tyorm/core';
import { expect, it } from 'vitest';
import { SqlServerSelectCompiler } from '../src/query/compiler';

@Entity({ schema: 'app', name: 'staff]records' })
class Staff {
    @PrimaryKey({ type: 'integer', name: 'staff_id' })
    id!: number;

    @Column({ type: 'string', name: 'display_name' })
    name!: string;
}

@Entity({ name: 'departments' })
class Department {
    @PrimaryKey({ type: 'integer', name: 'department_id' })
    id!: number;

    @PrimaryKey({ type: 'integer', name: 'region_id' })
    regionId!: number;

    @OneToMany(() => Worker, 'department')
    workers!: Worker[];
}

@Entity({ name: 'workers' })
class Worker {
    @PrimaryKey({ type: 'string', name: 'worker_id' })
    id!: string;

    @PrimaryKey({ type: 'integer', name: 'tenant_id' })
    tenantId!: number;

    @Column({ type: 'string', name: 'worker_name' })
    name!: string;

    @ManyToOne(() => Department, 'workers')
    @JoinColumn([
        { name: 'department_fk', referencedColumnName: 'department_id' },
        { name: 'region_fk', referencedColumnName: 'region_id' }
    ])
    department!: Department;

    @ManyToMany(() => Skill, 'workers')
    @JoinTable({
        name: 'worker_skills',
        schema: 'rel',
        joinColumns: [
            { name: 'worker_fk', referencedColumnName: 'worker_id' },
            { name: 'tenant_fk', referencedColumnName: 'tenant_id' }
        ],
        inverseJoinColumns: [
            { name: 'skill_fk', referencedColumnName: 'skill_id' }
        ]
    })
    skills!: Skill[];
}

@Entity({ name: 'skills' })
class Skill {
    @PrimaryKey({ type: 'integer', name: 'skill_id' })
    id!: number;

    @Column({ type: 'string', name: 'skill_name' })
    name!: string;

    @ManyToMany(() => Worker, 'skills')
    workers!: Worker[];
}

function resolver(): QuerySemanticResolver {
    return new QuerySemanticResolver(new OrmMetadataModel([getEntityMetadata(Staff)]));
}

function relationResolver(): QuerySemanticResolver {
    return new QuerySemanticResolver(new OrmMetadataModel([
        getEntityMetadata(Department),
        getEntityMetadata(Worker),
        getEntityMetadata(Skill)
    ]));
}

it('quotes SQL Server identifiers and binds filter and pagination values in statement order', () => {
    const query: SelectQuery = {
        kind: 'select',
        from: { entity: Staff, alias: 's' },
        selections: [{ expression: column('s', 'name'), alias: 'label' }],
        where: eq(column('s', 'name'), param('name')),
        joins: [],
        orderBy: [],
        distinct: false,
        offset: 2,
        limit: 3
    };
    const compiler = new SqlServerSelectCompiler();

    expect(compiler.compile(resolver().resolve(query), { name: "O'Brien" })).toEqual({
        sql: 'SELECT [s].[display_name] AS [label] FROM [app].[staff]]records] AS [s] ' +
            'WHERE [s].[display_name] = @p0 ORDER BY (SELECT NULL) ' +
            'OFFSET @p1 ROWS FETCH NEXT @p2 ROWS ONLY',
        parameters: ["O'Brien", 2, 3]
    });
});

it('compiles offset-only and limit-only paging with SQL Server syntax', () => {
    const compiler = new SqlServerSelectCompiler();
    const base: SelectQuery = {
        kind: 'select',
        from: { entity: Staff, alias: 's' },
        selections: [{ expression: column('s', 'id') }],
        joins: [],
        orderBy: [],
        distinct: false
    };

    expect(compiler.compile(resolver().resolve({ ...base, offset: 5 }))).toEqual({
        sql: 'SELECT [s].[staff_id] FROM [app].[staff]]records] AS [s] ' +
            'ORDER BY (SELECT NULL) OFFSET @p0 ROWS',
        parameters: [5]
    });
    expect(compiler.compile(resolver().resolve({ ...base, limit: 0 }))).toEqual({
        sql: 'SELECT [s].[staff_id] FROM [app].[staff]]records] AS [s] ' +
            'ORDER BY (SELECT NULL) OFFSET @p0 ROWS FETCH NEXT @p1 ROWS ONLY',
        parameters: [0, 0]
    });
});

it('uses COUNT_BIG to avoid SQL Server COUNT integer overflow', () => {
    const query: SelectQuery = {
        kind: 'select',
        from: { entity: Staff, alias: 's' },
        selections: [{ expression: count(), alias: 'total' }],
        joins: [],
        orderBy: [],
        distinct: false
    };

    expect(new SqlServerSelectCompiler().compile(resolver().resolve(query))).toEqual({
        sql: 'SELECT COUNT_BIG(*) AS [total] FROM [app].[staff]]records] AS [s]',
        parameters: []
    });
});

it('compiles input stored procedure arguments and rejects untyped output arguments', () => {
    const compiler = new SqlServerSelectCompiler();
    expect(compiler.compileProcedure({
        schema: 'app',
        name: 'search]staff',
        args: ['Ada', 2]
    })).toEqual({
        sql: 'EXEC [app].[search]]staff] @p0, @p1',
        parameters: ['Ada', 2]
    });
    expect(() => compiler.compileProcedure({
        name: 'searchStaff',
        args: [{ mode: 'out' }]
    })).toThrow('OUT and INOUT');
    expect(compiler.compileFunction({ schema: 'app', name: 'staff_count' })).toEqual({
        sql: 'SELECT [app].[staff_count]() AS [value]',
        parameters: []
    });
});

it('compiles chained inverse and junction joins with composite keys and ordered parameters', () => {
    const query: SelectQuery = {
        kind: 'select',
        from: { entity: Department, alias: 'd' },
        selections: [{ expression: column('s', 'name') }],
        joins: [
            {
                kind: 'join',
                type: 'left',
                sourceAlias: 'd',
                relation: 'workers',
                alias: 'w',
                on: eq(column('w', 'name'), param('workerName'))
            },
            {
                kind: 'join',
                type: 'inner',
                sourceAlias: 'w',
                relation: 'skills',
                alias: 's',
                on: eq(column('s', 'name'), param('skillName'))
            }
        ],
        where: eq(column('d', 'id'), param('departmentId')),
        orderBy: [],
        distinct: false,
        limit: 4,
        offset: 1
    };

    expect(new SqlServerSelectCompiler().compile(relationResolver().resolve(query), {
        workerName: 'Ada',
        skillName: 'SQL',
        departmentId: 7
    })).toEqual({
        sql: 'SELECT [s].[skill_name] FROM [departments] AS [d] ' +
            'LEFT JOIN [workers] AS [w] ON [d].[department_id] = [w].[department_fk] ' +
            'AND [d].[region_id] = [w].[region_fk] AND ([w].[worker_name] = @p0) ' +
            'INNER JOIN [rel].[worker_skills] AS [__tyorm_junction_0] ' +
            'ON [w].[worker_id] = [__tyorm_junction_0].[worker_fk] ' +
            'AND [w].[tenant_id] = [__tyorm_junction_0].[tenant_fk] ' +
            'INNER JOIN [skills] AS [s] ON [__tyorm_junction_0].[skill_fk] = [s].[skill_id] ' +
            'AND ([s].[skill_name] = @p1) WHERE [d].[department_id] = @p2 ' +
            'ORDER BY (SELECT NULL) OFFSET @p3 ROWS FETCH NEXT @p4 ROWS ONLY',
        parameters: ['Ada', 'SQL', 7, 1, 4]
    });
});
