import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { describe, expect, it } from 'vitest';
import {
    Column,
    Entity,
    getEntityMetadata,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    OneToOne,
    OrmMetadataModel,
    PrimaryKey,
    type EntityTarget
} from '../src';

const decorators = {
    Column, Entity, JoinColumn, JoinTable, ManyToMany,
    ManyToOne, OneToMany, OneToOne, PrimaryKey
};

describe('legacy decorator adapter', () => {
    it('resolves entities and relationships from TypeScript legacy decorator output', () => {
        const source = `
            @Entity({ name: 'departments' })
            class Department {
                @PrimaryKey({ type: 'integer', name: 'department_id' })
                id!: number;

                @OneToMany(() => User, 'department')
                members!: User[];
            }

            @Entity()
            class Role {
                @PrimaryKey({ type: 'integer' })
                id!: number;

                @ManyToMany(() => User, 'roles')
                users!: User[];
            }

            @Entity()
            class Profile {
                @PrimaryKey({ type: 'integer' })
                id!: number;

                @OneToOne(() => User, 'profile')
                user!: User;
            }

            @Entity({ schema: 'app', name: 'users' })
            class User {
                @PrimaryKey({ type: 'integer', name: 'user_id' })
                id!: number;

                @Column({ type: 'string', name: 'display_name' })
                name!: string;

                @ManyToOne(() => Department, 'members')
                @JoinColumn({ name: 'department_fk', referencedColumnName: 'department_id' })
                department!: Department;

                @OneToOne(() => Profile, 'user')
                @JoinColumn({ name: 'profile_fk', referencedColumnName: 'id' })
                profile!: Profile;

                @ManyToMany(() => Role, 'users')
                @JoinTable({ name: 'user_roles', schema: 'app' })
                roles!: Role[];
            }

            return { Department, User, Profile, Role };
        `;
        const { outputText } = transpileModule(source, {
            compilerOptions: {
                module: ModuleKind.CommonJS,
                target: ScriptTarget.ES2022,
                experimentalDecorators: true
            }
        });
        const loadEntities = new Function(...Object.keys(decorators), outputText);
        const entities: Record<'Department' | 'User' | 'Profile' | 'Role', EntityTarget> =
            loadEntities(...Object.values(decorators));
        const metadata = getEntityMetadata(entities.User);
        const model = new OrmMetadataModel(Object.values(entities).map(entity => getEntityMetadata(entity)));

        expect(metadata).toMatchObject({
            tableName: 'users',
            schema: 'app',
            columns: [{ propertyKey: 'name', columnName: 'display_name' }],
            primaryKeys: [{ propertyKey: 'id', columnName: 'user_id' }]
        });
        expect(model.getEntity(entities.User).relations).toMatchObject([
            { propertyKey: 'department', joinColumns: [{ name: 'department_fk' }] },
            { propertyKey: 'profile', isOwningSide: true, joinColumns: [{ name: 'profile_fk' }] },
            { propertyKey: 'roles', joinTable: { name: 'user_roles', schema: 'app' } }
        ]);
        expect(model.getEntity(entities.Department).relations).toMatchObject([
            { propertyKey: 'members', isOwningSide: false, inversePropertyKey: 'department' }
        ]);
    });

    it('keeps inherited declarations isolated across decorator modes', () => {
        class Base { }
        const legacyId: PropertyDecorator = PrimaryKey({ type: 'integer' });
        const legacyEntity: ClassDecorator = Entity();
        legacyId(Base.prototype, 'id');
        legacyEntity(Base);

        @Entity()
        class Modern extends Base {
            @Column({ type: 'string' })
            name!: string;
        }

        class Legacy extends Modern { }
        Column({ type: 'integer' })(Legacy.prototype, 'rank');
        legacyEntity(Legacy);

        expect(getEntityMetadata(Base).columns).toEqual([]);
        expect(getEntityMetadata(Modern).columns.map(item => item.propertyKey)).toEqual(['name']);
        const metadata = getEntityMetadata(Legacy);
        expect(metadata.columns.map(item => item.propertyKey)).toEqual(['name', 'rank']);
        expect(metadata.primaryKeys.map(item => item.propertyKey)).toEqual(['id']);
    });

    it('rejects legacy static members and methods', () => {
        class User {
            method() { }
        }

        const decorate = Column({ type: 'integer' });
        expect(() => decorate(User, 'id')).toThrow('public instance fields');
        expect(() => decorate(
            User.prototype, 'method', Object.getOwnPropertyDescriptor(User.prototype, 'method')
        )).toThrow('instance property');
    });
});
