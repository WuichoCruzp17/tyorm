import {
    column,
    Column,
    Entity,
    getEntityMetadata,
    JoinColumn,
    ManyToOne,
    OneToMany,
    OrmMetadataModel,
    PrimaryKey,
    QuerySemanticResolver,
    type SelectQuery
} from '@tyorm/core';

export function createLeftJoinFixture() {
    @Entity({ name: 'left_join_departments', schema: 'pg_temp' })
    class Department {
        @PrimaryKey({ type: 'integer', name: 'department_id' })
        id!: number;

        @OneToMany(() => User, 'department')
        users!: User[];
    }

    @Entity({ name: 'left_join_users', schema: 'pg_temp' })
    class User {
        @PrimaryKey({ type: 'integer', name: 'user_id' })
        id!: number;

        @Column({ type: 'string' })
        status!: string;

        @ManyToOne(() => Department, 'users', { nullable: true })
        @JoinColumn({ name: 'department_fk', referencedColumnName: 'department_id' })
        department!: Department | null;
    }

    const model = new OrmMetadataModel([
        getEntityMetadata(Department),
        getEntityMetadata(User)
    ]);

    const inverseQuery: SelectQuery = {
        kind: 'select',
        from: { entity: Department, alias: 'd' },
        selections: [
            { expression: column('d', 'id') },
            { expression: column('u', 'id') }
        ],
        joins: [{
            kind: 'join',
            type: 'left',
            sourceAlias: 'd',
            relation: 'users',
            alias: 'u',
            on: {
                kind: 'comparison',
                operator: 'eq',
                left: column('u', 'status'),
                right: { kind: 'parameter', name: 'status' }
            }
        }],
        orderBy: [{ expression: column('d', 'id'), direction: 'asc' }],
        distinct: false
    };

    const owningQuery: SelectQuery = {
        kind: 'select',
        from: { entity: User, alias: 'u' },
        selections: [
            { expression: column('u', 'id') },
            { expression: column('d', 'id') }
        ],
        joins: [{
            kind: 'join',
            type: 'left',
            sourceAlias: 'u',
            relation: 'department',
            alias: 'd'
        }],
        orderBy: [{ expression: column('u', 'id'), direction: 'asc' }],
        distinct: false
    };

    return {
        resolver: new QuerySemanticResolver(model),
        inverseQuery,
        owningQuery
    };
}

