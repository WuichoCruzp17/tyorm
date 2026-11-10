
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    JoinColumn,
    getEntityMetadata,
    ensureSymbolMetadata,
    Column,
    ManyToMany,
    JoinTable
} from '../src/decorators';

import {
    MetadataError,
    OrmEntityMetadata,
    OrmMetadataModel
} from '../src/metadata';

import type { EntityMetadata } from '../src/metadata/contracts/entity-metadata';
import type { ColumnMetadata } from '../src/metadata/contracts/column-metadata';
import type { PrimaryKeyMetadata } from '../src/metadata/contracts/primary-key-metadata';

ensureSymbolMetadata();

describe('OrmMetadataModel', () => {
    it('should consolidate entities and relations', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const metadata = model.getEntity(Order);

        expect(metadata.entity.target).toBe(Order);
        expect(metadata.relations).toHaveLength(1);
        expect(metadata.relations[0]?.type)
            .toBe('many-to-one');
        expect(metadata.relations[0]?.joinColumns[0]?.name)
            .toBe('user_id');
    });

    it('should report registered entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        expect(model.hasEntity(User)).toBe(true);
        expect(model.getEntities()).toHaveLength(1);
    });

    it('should reject unknown entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        class Unknown { }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        expect(() => model.getEntity(Unknown))
            .toThrow(MetadataError);
    });

    it('should reject duplicate entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const metadata = getEntityMetadata(User);

        expect(() => new OrmMetadataModel([
            metadata,
            metadata
        ])).toThrow(/Duplicate entity:/);
    });

    it('should expose immutable ORM metadata', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const metadata = model.getEntity(User);
        const entities = model.getEntities();

        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(entities)).toBe(true);
        expect(Object.isFrozen(metadata.relations))
            .toBe(true);
    });


    it('should deeply freeze entity metadata snapshots', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            id!: string;

            @Column({
                type: 'string',
                name: 'full_name'
            })
            name!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const metadata = model.getEntity(User);

        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(metadata.entity)).toBe(true);

        expect(Object.isFrozen(metadata.entity.columns))
            .toBe(true);

        expect(Object.isFrozen(metadata.entity.primaryKeys))
            .toBe(true);

        for (const column of metadata.entity.columns) {
            expect(Object.isFrozen(column)).toBe(true);
        }

        for (const primaryKey of metadata.entity.primaryKeys) {
            expect(Object.isFrozen(primaryKey)).toBe(true);
        }
    });


    it('should deeply freeze relation metadata', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const metadata = model.getEntity(Order);
        const relation = metadata.relations[0]!;

        expect(Object.isFrozen(metadata.relations))
            .toBe(true);

        expect(Object.isFrozen(relation)).toBe(true);

        expect(Object.isFrozen(relation.joinColumns))
            .toBe(true);

        for (const column of relation.joinColumns) {
            expect(Object.isFrozen(column)).toBe(true);
        }
    });


    it('should deeply freeze join table metadata', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToMany(() => Role)
            @JoinTable({
                name: 'user_roles',
                joinColumns: [{
                    name: 'user_id',
                    referencedColumnName: 'id'
                }],
                inverseJoinColumns: [{
                    name: 'role_id',
                    referencedColumnName: 'id'
                }]
            })
            roles!: Role[];
        }

        @Entity({ name: 'roles' })
        class Role {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Role)
        ]);

        const relation =
            model.getEntity(User).relations[0]!;

        const joinTable = relation.joinTable!;

        expect(Object.isFrozen(joinTable)).toBe(true);

        expect(Object.isFrozen(joinTable.joinColumns))
            .toBe(true);

        expect(Object.isFrozen(joinTable.inverseJoinColumns))
            .toBe(true);

        for (const column of [
            ...joinTable.joinColumns,
            ...joinTable.inverseJoinColumns
        ]) {
            expect(Object.isFrozen(column)).toBe(true);
        }
    });


    it('should isolate entity metadata from source arrays', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({ type: 'string' })
            name!: string;
        }

        const source = getEntityMetadata(User);

        const model = new OrmMetadataModel([source]);

        const snapshot = model.getEntity(User).entity;

        expect(snapshot).not.toBe(source);

        expect(snapshot.columns).not.toBe(source.columns);

        expect(snapshot.primaryKeys)
            .not.toBe(source.primaryKeys);

        expect(snapshot.columns).toEqual(source.columns);

        expect(snapshot.primaryKeys)
            .toEqual(source.primaryKeys);
    });


    it('should return stable immutable metadata references', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @Column({ type: 'string' })
            name!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const first = model.getEntity(User);
        const second = model.getEntity(User);

        expect(first).toBe(second);
        expect(first.entity).toBe(second.entity);
        expect(first.entity.columns).toBe(
            second.entity.columns
        );

        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.entity)).toBe(true);
    });



    it('should remain stable when source metadata is mutated', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            id!: string;

            @Column({
                type: 'string',
                name: 'full_name'
            })
            name!: string;
        }

        // 1. Obtener los metadatos originales del registro.
        const registered = getEntityMetadata(User);

        // 2. Crear copias mutables independientes.
        // Conservamos todas las propiedades de los contratos.
        const sourceColumns = registered.columns.map(
            column => ({ ...column })
        );

        const sourcePrimaryKeys = registered.primaryKeys.map(
            primaryKey => ({ ...primaryKey })
        );

        // 3. Construir una fuente independiente.
        const source = {
            ...registered,
            columns: sourceColumns,
            primaryKeys: sourcePrimaryKeys
        };

        // 4. Construir el modelo ORM.
        // El modelo debe crear sus propios snapshots.
        const model = new OrmMetadataModel([source]);

        // 5. Comprobar que los metadatos originales
        // y los del modelo no comparten referencias.
        const metadata = model.getEntity(User).entity;

        expect(metadata).not.toBe(source);

        expect(metadata.columns).not.toBe(sourceColumns);

        expect(metadata.primaryKeys)
            .not.toBe(sourcePrimaryKeys);

        // 6. Modificar los metadatos externos
        // después de construir el modelo.
        sourceColumns[0]!.columnName = 'modified_name';

        sourcePrimaryKeys[0]!.columnName = 'modified_id';

        // Agregar una columna adicional a la fuente.
        sourceColumns.push({
            ...sourceColumns[0]!,
            propertyKey: 'extra',
            columnName: 'extra'
        });

        // 7. Verificar que el modelo conserva
        // sus valores originales.
        expect(metadata.columns).toHaveLength(1);

        expect(metadata.columns[0]?.columnName)
            .toBe('full_name');

        expect(metadata.primaryKeys[0]?.columnName)
            .toBe('user_id');

        // 8. Verificar que los snapshots
        // permanecen congelados.
        expect(Object.isFrozen(metadata)).toBe(true);

        expect(Object.isFrozen(metadata.columns))
            .toBe(true);

        expect(Object.isFrozen(metadata.primaryKeys))
            .toBe(true);

        expect(Object.isFrozen(metadata.columns[0]))
            .toBe(true);

        expect(Object.isFrozen(metadata.primaryKeys[0]))
            .toBe(true);

        // 9. Una segunda recuperación debe devolver
        // exactamente el mismo snapshot.
        const second = model.getEntity(User).entity;

        expect(second).toBe(metadata);

        expect(second.columns[0]?.columnName)
            .toBe('full_name');

        expect(second.primaryKeys[0]?.columnName)
            .toBe('user_id');
    });


    it('should protect returned entity collections', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const entities = model.getEntities();

        expect(Object.isFrozen(entities)).toBe(true);
        expect(entities).toHaveLength(1);

        expect(() => {
            (entities as OrmEntityMetadata[]).push(
                entities[0]!
            );
        }).toThrow(TypeError);

        expect(model.getEntities()).toHaveLength(1);
    });


    it('should accept distinct self-referencing foreign keys', () => {
        @Entity({ name: 'employees' })
        class Employee {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => Employee)
            @JoinColumn({
                name: 'manager_id',
                referencedColumnName: 'id'
            })
            manager!: Employee;

            @ManyToOne(() => Employee)
            @JoinColumn({
                name: 'mentor_id',
                referencedColumnName: 'id'
            })
            mentor!: Employee;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(Employee)
        ]);

        const relations =
            model.getEntity(Employee).relations;

        expect(relations).toHaveLength(2);

        expect(
            relations.map(
                relation => relation.joinColumns[0]?.name
            )
        ).toEqual([
            'manager_id',
            'mentor_id'
        ]);
    });


    it('should reject duplicate self-referencing foreign keys', () => {
        @Entity({ name: 'employees' })
        class Employee {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => Employee)
            @JoinColumn({
                name: 'manager_id',
                referencedColumnName: 'id'
            })
            manager!: Employee;

            @ManyToOne(() => Employee)
            @JoinColumn({
                name: 'manager_id',
                referencedColumnName: 'id'
            })
            mentor!: Employee;
        }

        expect(() => new OrmMetadataModel([
            getEntityMetadata(Employee)
        ])).toThrow(/Duplicate local join column/);
    });


    it('should resolve relations independently of entity order', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({
                type: 'uuid',
                name: 'user_id'
            })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({
                type: 'uuid',
                name: 'order_id'
            })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'customer_id',
                referencedColumnName: 'user_id'
            })
            customer!: User;
        }

        const userMetadata = getEntityMetadata(User);
        const orderMetadata = getEntityMetadata(Order);

        const first = new OrmMetadataModel([
            userMetadata,
            orderMetadata
        ]);

        const second = new OrmMetadataModel([
            orderMetadata,
            userMetadata
        ]);

        const firstRelation =
            first.getEntity(Order).relations[0]!;

        const secondRelation =
            second.getEntity(Order).relations[0]!;

        expect(firstRelation.type)
            .toBe(secondRelation.type);

        expect(firstRelation.isOwningSide)
            .toBe(secondRelation.isOwningSide);

        expect(firstRelation.target())
            .toBe(secondRelation.target());

        expect(firstRelation.joinColumns)
            .toStrictEqual(secondRelation.joinColumns);
    });


});
