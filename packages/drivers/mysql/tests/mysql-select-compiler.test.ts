import { Column, Entity, OrmMetadataModel, PrimaryKey, QuerySemanticResolver, column, eq, getEntityMetadata, param, vectorDistance, type SelectQuery } from '@tyorm/core';
import { expect, it } from 'vitest';
import { MySQLSelectCompiler } from '../src/query/compiler';
import {
    Badge,
    createRelationResolver,
    Department,
    Employee,
    Role
} from './relation-joins.fixture';

@Entity({ schema: 'app', name: 'line`items' })
class Item {
    @PrimaryKey({ type: 'integer', name: 'item_id' })
    id!: number;

    @Column({ type: 'string' })
    label!: string;

    @Column({ type: 'vector' })
    embedding!: number[];
}

it('quotes identifiers and binds filter and offset values in order', () => {
    const compiler = new MySQLSelectCompiler();
    const resolver = new QuerySemanticResolver(new OrmMetadataModel([getEntityMetadata(Item)]));
    const query = resolver.resolve({
        kind: 'select', from: { entity: Item, alias: 'i' },
        selections: [{ expression: column('i', 'id') }],
        joins: [], orderBy: [], distinct: false,
        where: eq(column('i', 'label'), param('label')), offset: 2
    });
    expect(compiler.compile(query, { label: "O'Brien" })).toEqual({
        sql: 'SELECT `i`.`item_id` FROM `app`.`line``items` AS `i` WHERE `i`.`label` = ? LIMIT 18446744073709551615 OFFSET ?',
        parameters: ["O'Brien", 2]
    });
    expect(() => compiler.compile(query)).toThrow('Missing query parameter');
});

it('rejects vector distance queries explicitly', () => {
    const compiler = new MySQLSelectCompiler();
    const resolver = new QuerySemanticResolver(new OrmMetadataModel([getEntityMetadata(Item)]));
    const query = resolver.resolve({
        kind: 'select', from: { entity: Item, alias: 'i' },
        selections: [{ expression: vectorDistance(column('i', 'embedding'), [1, 2]) }],
        joins: [], orderBy: [], distinct: false
    });
    expect(() => compiler.compile(query)).toThrow('The MySQL provider does not support vector distance queries.');
});

it('compiles inverse one-to-many joins with composite keys and binds ON before WHERE and pagination', () => {
    const resolver = createRelationResolver();
    const compiler = new MySQLSelectCompiler();
    const query: SelectQuery = {
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
    };

    expect(compiler.compile(resolver.resolve(query), {
        employeeName: 'Ada',
        departmentId: 10
    })).toEqual({
        sql: 'SELECT `e`.`employee_name` FROM `join_departments` AS `d` ' +
            'LEFT JOIN `join_employees` AS `e` ON `d`.`department_id` = `e`.`department_fk` ' +
            'AND `d`.`region_id` = `e`.`region_fk` AND (`e`.`employee_name` = ?) ' +
            'WHERE `d`.`department_id` = ? ORDER BY `e`.`employee_name` ASC LIMIT ? OFFSET ?',
        parameters: ['Ada', 10, 5, 2]
    });
});

it('compiles an owning many-to-one join using the source foreign-key columns', () => {
    const resolver = createRelationResolver();
    const compiler = new MySQLSelectCompiler();
    const resolved = resolver.resolve({
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
    });

    expect(compiler.compile(resolved)).toEqual({
        sql: 'SELECT `d`.`department_name` FROM `join_employees` AS `e` ' +
            'INNER JOIN `join_departments` AS `d` ' +
            'ON `e`.`department_fk` = `d`.`department_id` ' +
            'AND `e`.`region_fk` = `d`.`region_id`',
        parameters: []
    });
});

it('compiles owning and inverse one-to-one joins', () => {
    const resolver = createRelationResolver();
    const compiler = new MySQLSelectCompiler();
    const owning = resolver.resolve({
        kind: 'select',
        from: { entity: Employee, alias: 'e' },
        selections: [{ expression: column('b', 'label') }],
        joins: [{
            kind: 'join', type: 'left', sourceAlias: 'e', relation: 'badge', alias: 'b'
        }],
        orderBy: [],
        distinct: false
    });
    const inverse = resolver.resolve({
        kind: 'select',
        from: { entity: Badge, alias: 'b' },
        selections: [{ expression: column('e', 'name') }],
        joins: [{
            kind: 'join', type: 'left', sourceAlias: 'b', relation: 'employee', alias: 'e'
        }],
        orderBy: [],
        distinct: false
    });

    expect(compiler.compile(owning).sql).toContain(
        'LEFT JOIN `join_badges` AS `b` ON `e`.`badge_fk` = `b`.`badge_id`'
    );
    expect(compiler.compile(inverse).sql).toContain(
        'LEFT JOIN `join_employees` AS `e` ON `b`.`badge_id` = `e`.`badge_fk`'
    );
});

it('compiles owning and inverse many-to-many joins over composite junction keys', () => {
    const resolver = createRelationResolver();
    const compiler = new MySQLSelectCompiler();
    const owning = resolver.resolve({
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
    });
    const inverse = resolver.resolve({
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

    expect(compiler.compile(owning, { roleName: 'admin', employeeId: 'u1' })).toEqual({
        sql: 'SELECT `r`.`role_name` FROM `join_employees` AS `e` ' +
            'INNER JOIN `employee_roles` AS `__tyorm_junction_0` ' +
            'ON `e`.`employee_id` = `__tyorm_junction_0`.`employee_fk` ' +
            'AND `e`.`tenant_id` = `__tyorm_junction_0`.`tenant_fk` ' +
            'INNER JOIN `join_roles` AS `r` ' +
            'ON `__tyorm_junction_0`.`role_fk` = `r`.`role_id` ' +
            'AND (`r`.`role_name` = ?) WHERE `e`.`employee_id` = ?',
        parameters: ['admin', 'u1']
    });
    expect(compiler.compile(inverse).sql).toContain(
        'LEFT JOIN `employee_roles` AS `__tyorm_junction_0` ' +
        'ON `r`.`role_id` = `__tyorm_junction_0`.`role_fk`'
    );
    expect(compiler.compile(inverse).sql).toContain(
        'LEFT JOIN `join_employees` AS `e` ' +
        'ON `__tyorm_junction_0`.`employee_fk` = `e`.`employee_id` ' +
        'AND `__tyorm_junction_0`.`tenant_fk` = `e`.`tenant_id`'
    );
});
