import {
    describe,
    expect,
    it
} from 'vitest';

import {
    JunctionJoinResolver
} from '../src/query/semantic/junction-join-resolver';

import type {
    RelationMetadata
} from '../src/metadata/contracts';

import type {
    OrmEntityMetadata
} from '../src/metadata/orm-entity-metadata';

class User { }
class Role { }

const owningRelation: RelationMetadata = {
    propertyKey: 'roles',
    type: 'many-to-many',
    target: () => Role,
    inversePropertyKey: 'users',
    isOwningSide: true,
    nullable: false,
    joinColumns: [],
    joinTable: {
        name: 'user_roles',
        joinColumns: [
            {
                name: 'user_id',
                referencedColumnName: 'id'
            }
        ],
        inverseJoinColumns: [
            {
                name: 'role_id',
                referencedColumnName: 'id'
            }
        ]
    }
};

const inverseRelation: RelationMetadata = {
    propertyKey: 'users',
    type: 'many-to-many',
    target: () => User,
    inversePropertyKey: 'roles',
    isOwningSide: false,
    nullable: false,
    joinColumns: []
};

function metadata(
    target: new () => object,
    relations: readonly RelationMetadata[]
): OrmEntityMetadata {
    return {
        entity: {
            target,
            tableName: target.name.toLowerCase(),
            columns: [],
            primaryKeys: []
        } as OrmEntityMetadata['entity'],
        relations
    };
}

describe('JunctionJoinResolver', () => {

    const resolver = new JunctionJoinResolver();

    const users = metadata(User, [owningRelation]);
    const roles = metadata(Role, [inverseRelation]);

    it('resolves owning ManyToMany', () => {
        const result = resolver.resolve(
            owningRelation,
            'u',
            'r',
            users,
            roles,
            '__junction_0'
        );

        expect(result.kind).toBe('junction');
        expect(result.table.name).toBe('user_roles');

        expect(result.sourceConditions[0]).toEqual({
            kind: 'resolved-join-condition',
            left: {
                tableAlias: 'u',
                columnName: 'id'
            },
            right: {
                tableAlias: '__junction_0',
                columnName: 'user_id'
            }
        });

        expect(result.targetConditions[0]).toEqual({
            kind: 'resolved-join-condition',
            left: {
                tableAlias: '__junction_0',
                columnName: 'role_id'
            },
            right: {
                tableAlias: 'r',
                columnName: 'id'
            }
        });
    });

    it('resolves inverse ManyToMany', () => {
        const result = resolver.resolve(
            inverseRelation,
            'r',
            'u',
            roles,
            users,
            '__junction_1'
        );

        expect(result.sourceConditions[0]?.left.columnName)
            .toBe('id');

        expect(result.sourceConditions[0]?.right.columnName)
            .toBe('role_id');

        expect(result.targetConditions[0]?.left.columnName)
            .toBe('user_id');

        expect(result.targetConditions[0]?.right.columnName)
            .toBe('id');
    });

    it('preserves junction table schema', () => {
        const relation: RelationMetadata = {
            ...owningRelation,
            joinTable: {
                ...owningRelation.joinTable!,
                schema: 'security'
            }
        };

        const result = resolver.resolve(
            relation,
            'u',
            'r',
            users,
            roles,
            '__junction_2'
        );

        expect(result.table.schema).toBe('security');
    });

    it('rejects missing junction table', () => {
        const {
            joinTable: _ignored,
            ...withoutJoinTable
        } = owningRelation;

        const relation: RelationMetadata = withoutJoinTable;

        expect(() =>
            resolver.resolve(
                relation,
                'u',
                'r',
                users,
                roles,
                '__junction_3'
            )
        ).toThrow(/has no join table/);
    });
});
