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
    OneToOne,
    PrimaryKey,
    QuerySemanticResolver,
    column,
    eq,
    gte,
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

@Entity({ name: 'one_to_one_accounts' })
class OneToOneAccount {
    @PrimaryKey({ type: 'integer', name: 'account_id' })
    id!: number;

    @OneToOne(() => OneToOneProfile, 'account')
    @JoinColumn({ name: 'profile_fk', referencedColumnName: 'profile_id' })
    profile!: OneToOneProfile;
}

@Entity({ name: 'one_to_one_profiles' })
class OneToOneProfile {
    @PrimaryKey({ type: 'integer', name: 'profile_id' })
    id!: number;

    @OneToOne(() => OneToOneAccount, 'profile')
    account!: OneToOneAccount;
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

function oneToOneResolver(): QuerySemanticResolver {
    return new QuerySemanticResolver(new OrmMetadataModel([
        getEntityMetadata(OneToOneAccount),
        getEntityMetadata(OneToOneProfile)
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

it('compiles typed OUT and INOUT procedure arguments with ordered placeholders', () => {
    const compiler = new SqlServerSelectCompiler();
    expect(compiler.compileProcedure({
        schema: 'app',
        name: 'search]staff',
        args: [
            'Ada',
            { mode: 'out', type: { type: 'integer' } },
            { mode: 'inout', value: 2, type: { type: 'integer' } }
        ]
    })).toEqual({
        sql: 'EXEC [app].[search]]staff] @p0, @p1 OUTPUT, @p2 OUTPUT',
        parameters: ['Ada', null, 2]
    });
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

it('compiles an owning direct join and binds ON values before WHERE values', () => {
    const query: SelectQuery = {
        kind: 'select',
        from: { entity: Worker, alias: 'w' },
        selections: [
            { expression: column('w', 'name') },
            { expression: column('d', 'id'), alias: 'departmentId' }
        ],
        joins: [{
            kind: 'join',
            type: 'inner',
            sourceAlias: 'w',
            relation: 'department',
            alias: 'd',
            on: eq(column('d', 'id'), param('departmentId'))
        }],
        where: eq(column('w', 'name'), param('workerName')),
        orderBy: [],
        distinct: false
    };

    expect(new SqlServerSelectCompiler().compile(relationResolver().resolve(query), {
        departmentId: 7,
        workerName: 'Ada'
    })).toEqual({
        sql: 'SELECT [w].[worker_name], [d].[department_id] AS [departmentId] ' +
            'FROM [workers] AS [w] INNER JOIN [departments] AS [d] ' +
            'ON [w].[department_fk] = [d].[department_id] ' +
            'AND [w].[region_fk] = [d].[region_id] AND ([d].[department_id] = @p0) ' +
            'WHERE [w].[worker_name] = @p1',
        parameters: [7, 'Ada']
    });
});

it('compiles inverse many-to-many joins and grouped HAVING with ordered parameter binding', () => {
    const workerCount = count(column('w', 'id'));
    const query: SelectQuery = {
        kind: 'select',
        from: { entity: Skill, alias: 's' },
        selections: [
            { expression: column('s', 'name'), alias: 'skillName' },
            { expression: workerCount, alias: 'workerCount' }
        ],
        joins: [{
            kind: 'join',
            type: 'left',
            sourceAlias: 's',
            relation: 'workers',
            alias: 'w',
            on: eq(column('w', 'name'), param('workerName'))
        }],
        where: eq(column('s', 'id'), param('skillId')),
        groupBy: [column('s', 'id'), column('s', 'name')],
        having: gte(workerCount, param('minimumWorkers')),
        orderBy: [{ expression: workerCount, direction: 'desc' }],
        distinct: true,
        offset: 1,
        limit: 5
    };

    expect(new SqlServerSelectCompiler().compile(relationResolver().resolve(query), {
        workerName: 'Ada',
        skillId: 4,
        minimumWorkers: 2
    })).toEqual({
        sql: 'SELECT DISTINCT [s].[skill_name] AS [skillName], ' +
            'COUNT_BIG([w].[worker_id]) AS [workerCount] FROM [skills] AS [s] ' +
            'LEFT JOIN [rel].[worker_skills] AS [__tyorm_junction_0] ' +
            'ON [s].[skill_id] = [__tyorm_junction_0].[skill_fk] ' +
            'LEFT JOIN [workers] AS [w] ON [__tyorm_junction_0].[worker_fk] = [w].[worker_id] ' +
            'AND [__tyorm_junction_0].[tenant_fk] = [w].[tenant_id] ' +
            'AND ([w].[worker_name] = @p0) WHERE [s].[skill_id] = @p1 ' +
            'GROUP BY [s].[skill_id], [s].[skill_name] ' +
            'HAVING COUNT_BIG([w].[worker_id]) >= @p2 ' +
            'ORDER BY COUNT_BIG([w].[worker_id]) DESC OFFSET @p3 ROWS FETCH NEXT @p4 ROWS ONLY',
        parameters: ['Ada', 4, 2, 1, 5]
    });
});

it('compiles owning and inverse one-to-one joins with the physical foreign key orientation', () => {
    const base: SelectQuery = {
        kind: 'select',
        from: { entity: OneToOneAccount, alias: 'a' },
        selections: [{ expression: column('p', 'id') }],
        joins: [{
            kind: 'join',
            type: 'inner',
            sourceAlias: 'a',
            relation: 'profile',
            alias: 'p'
        }],
        orderBy: [],
        distinct: false
    };
    const compiler = new SqlServerSelectCompiler();

    expect(compiler.compile(oneToOneResolver().resolve(base))).toEqual({
        sql: 'SELECT [p].[profile_id] FROM [one_to_one_accounts] AS [a] ' +
            'INNER JOIN [one_to_one_profiles] AS [p] ON [a].[profile_fk] = [p].[profile_id]',
        parameters: []
    });

    const inverse: SelectQuery = {
        ...base,
        from: { entity: OneToOneProfile, alias: 'p' },
        selections: [{ expression: column('a', 'id') }],
        joins: [{
            kind: 'join',
            type: 'left',
            sourceAlias: 'p',
            relation: 'account',
            alias: 'a'
        }]
    };

    expect(compiler.compile(oneToOneResolver().resolve(inverse))).toEqual({
        sql: 'SELECT [a].[account_id] FROM [one_to_one_profiles] AS [p] ' +
            'LEFT JOIN [one_to_one_accounts] AS [a] ON [p].[profile_id] = [a].[profile_fk]',
        parameters: []
    });
});

it('compiles inserts with returned columns and DEFAULT VALUES', () => {
    const target = {
        schema: 'app',
        table: 'order]details',
        returning: [
            { column: 'order_id', alias: 'id' },
            { column: 'order_label', alias: 'label' }
        ]
    };
    const compiler = new SqlServerSelectCompiler();

    expect(compiler.compileMutation({
        ...target,
        kind: 'insert',
        values: [{ column: 'order_label', value: "O'Brien" }]
    })).toEqual({
        sql: 'INSERT INTO [app].[order]]details] ([order_label]) ' +
            'OUTPUT INSERTED.[order_id] AS [id], INSERTED.[order_label] AS [label] ' +
            'VALUES (@p0)',
        parameters: ["O'Brien"]
    });

    expect(compiler.compileMutation({
        ...target,
        kind: 'insert',
        values: []
    })).toEqual({
        sql: 'INSERT INTO [app].[order]]details] ' +
            'OUTPUT INSERTED.[order_id] AS [id], INSERTED.[order_label] AS [label] ' +
            'DEFAULT VALUES',
        parameters: []
    });

    expect(compiler.compileMutation({
        table: 'empty_records',
        kind: 'insert',
        values: [],
        returning: []
    })).toEqual({
        sql: 'INSERT INTO [empty_records] DEFAULT VALUES',
        parameters: []
    });
});

it('compiles update and delete with complete keys and returned row images', () => {
    const compiler = new SqlServerSelectCompiler();
    const target = {
        table: 'documents',
        returning: [
            { column: 'document_id', alias: 'id' },
            { column: 'tenant_id', alias: 'tenant' },
            { column: 'title', alias: 'title' }
        ]
    };

    expect(compiler.compileMutation({
        ...target,
        kind: 'update',
        values: [{ column: 'title', value: 'updated' }],
        key: [{ column: 'document_id', value: 7 }, { column: 'tenant_id', value: 4 }]
    })).toEqual({
        sql: 'UPDATE [documents] SET [title] = @p0 ' +
            'OUTPUT INSERTED.[document_id] AS [id], INSERTED.[tenant_id] AS [tenant], ' +
            'INSERTED.[title] AS [title] WHERE [document_id] = @p1 AND [tenant_id] = @p2',
        parameters: ['updated', 7, 4]
    });

    expect(compiler.compileMutation({
        ...target,
        kind: 'delete',
        key: [{ column: 'document_id', value: 7 }, { column: 'tenant_id', value: 4 }]
    })).toEqual({
        sql: 'DELETE FROM [documents] OUTPUT DELETED.[document_id] AS [id], ' +
            'DELETED.[tenant_id] AS [tenant], DELETED.[title] AS [title] ' +
            'WHERE [document_id] = @p0 AND [tenant_id] = @p1',
        parameters: [7, 4]
    });
});

it('compiles assigned-key upserts with a serializable merge hint and bound assignments', () => {
    expect(new SqlServerSelectCompiler().compileMutation({
        schema: 'app',
        table: 'settings',
        kind: 'upsert',
        values: [
            { column: 'tenant_id', value: 2 },
            { column: 'setting_key', value: 'locale' },
            { column: 'setting_value', value: 'en' }
        ],
        conflictColumns: ['tenant_id', 'setting_key'],
        assignments: [{ column: 'setting_value', value: "O'Brien" }],
        returning: [
            { column: 'tenant_id', alias: 'tenant' },
            { column: 'setting_key', alias: 'key' },
            { column: 'setting_value', alias: 'value' }
        ]
    })).toEqual({
        sql: 'MERGE [app].[settings] WITH (HOLDLOCK) AS [target] ' +
            'USING (VALUES (@p0, @p1, @p2)) AS [source] ([tenant_id], [setting_key], [setting_value]) ' +
            'ON [target].[tenant_id] = [source].[tenant_id] ' +
            'AND [target].[setting_key] = [source].[setting_key] ' +
            'WHEN MATCHED THEN UPDATE SET [setting_value] = @p3 ' +
            'WHEN NOT MATCHED THEN INSERT ([tenant_id], [setting_key], [setting_value]) ' +
            'VALUES ([source].[tenant_id], [source].[setting_key], [source].[setting_value]) ' +
            'OUTPUT INSERTED.[tenant_id] AS [tenant], INSERTED.[setting_key] AS [key], ' +
            'INSERTED.[setting_value] AS [value];',
        parameters: [2, 'locale', 'en', "O'Brien"]
    });
});
