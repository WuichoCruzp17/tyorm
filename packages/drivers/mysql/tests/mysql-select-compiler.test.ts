import { Column, Entity, OrmMetadataModel, PrimaryKey, QuerySemanticResolver, column, eq, getEntityMetadata, param } from '@tyorm/core';
import { expect, it } from 'vitest';
import { MySQLSelectCompiler } from '../src/query/compiler';

@Entity({ schema: 'app', name: 'line`items' })
class Item {
    @PrimaryKey({ type: 'integer', name: 'item_id' })
    id!: number;

    @Column({ type: 'string' })
    label!: string;
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
