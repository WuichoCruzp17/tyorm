import { Entity, PrimaryKey, OrmMetadataModel, QuerySemanticResolver, getEntityMetadata, column, eq, param } from '@tyorm/core';
import { expect, it } from 'vitest';
import { SQLiteSelectCompiler } from '../src/query/compiler/sqlite-select-compiler';

if (Symbol.metadata === undefined) Object.defineProperty(Symbol, 'metadata', { value: Symbol('Symbol.metadata') });

@Entity({ name: 'line"items' })
class Item {
    @PrimaryKey({ name: 'item_id', type: 'integer' })
    id!: number;
}

it('quotes metadata names and binds values before an offset-only clause', () => {
    const compiler = new SQLiteSelectCompiler();
    const resolver = new QuerySemanticResolver(new OrmMetadataModel([getEntityMetadata(Item)]));
    const id = column('i', 'id');
    const query = resolver.resolve({
        kind: 'select',
        from: { entity: Item, alias: 'i' },
        selections: [{ expression: id }],
        joins: [], orderBy: [], distinct: false,
        where: eq(id, param('id')),
        offset: 2
    });
    expect(compiler.compile(query, { id: 4 })).toEqual({
        sql: 'SELECT "i"."item_id" FROM "line""items" AS "i" WHERE "i"."item_id" = ? LIMIT -1 OFFSET ?',
        parameters: [4, 2]
    });
    expect(() => compiler.compile(query)).toThrow('Missing query parameter "id"');
});
