
import type {
    EntityMetadata,
    EntityTarget,
    RelationMetadata
} from './contracts';

import type {
    OrmEntityMetadata
} from './orm-entity-metadata';

import { MetadataError } from './metadata-error';

export class OrmMetadataValidator {


    validate(
        entities: readonly OrmEntityMetadata[]
    ): void {
        const occupiedTables = new Map<string, string>();

        // =====================================================
        // 1. Construir índice de entidades
        // =====================================================

        const entityMap = new Map<
            EntityTarget,
            OrmEntityMetadata
        >();

        for (const item of entities) {
            entityMap.set(item.entity.target, item);
        }

        // =====================================================
        // 2. Validar conflictos entre propiedades
        // =====================================================

        for (const item of entities) {
            this.validatePropertyCollisions(item);
        }

        // =====================================================
        // 3. Validar tipos de claves foráneas
        // =====================================================

        for (const item of entities) {
            this.validateForeignKeyTypes(
                item,
                entityMap
            );
        }

        // =====================================================
        // 5. Validar propiedad de escritura de columnas FK
        // =====================================================

        for (const item of entities) {
            this.validateSharedColumnWriteOwnership(item);
        }

        // =====================================================
        // 6. Registrar tablas físicas de entidades
        // =====================================================

        for (const item of entities) {
            const entity = item.entity;

            const key = this.tableKey(
                entity.schema,
                entity.tableName
            );

            const owner = `entity ${entity.target.name}`;

            this.registerTable(
                occupiedTables,
                key,
                owner,
                this.qualifiedName(
                    entity.schema,
                    entity.tableName
                )
            );
        }

        // =====================================================
        // 7. Validar y registrar tablas intermedias
        // =====================================================

        for (const item of entities) {
            for (const relation of item.relations) {

                if (!relation.isOwningSide) {
                    continue;
                }

                if (relation.type !== 'many-to-many') {
                    continue;
                }

                const joinTable = relation.joinTable;

                if (!joinTable) {
                    throw new MetadataError(
                        `Owning ManyToMany relation ` +
                        `${item.entity.target.name}.` +
                        `${String(relation.propertyKey)} ` +
                        `requires a join table.`
                    );
                }

                // Heredar el esquema de la entidad propietaria
                // cuando la tabla intermedia no declara uno.
                const schema =
                    joinTable.schema ?? item.entity.schema;

                const key = this.tableKey(
                    schema,
                    joinTable.name
                );

                const owner =
                    `relation ${item.entity.target.name}.` +
                    String(relation.propertyKey);

                // Detectar colisiones con tablas de entidades
                // y otras tablas intermedias.
                this.registerTable(
                    occupiedTables,
                    key,
                    owner,
                    this.qualifiedName(
                        schema,
                        joinTable.name
                    )
                );

                // Detectar columnas físicas duplicadas
                // entre joinColumns e inverseJoinColumns.
                this.validateJoinTableColumns(
                    item.entity,
                    relation
                );
            }
        }
    }


    private registerTable(
        occupied: Map<string, string>,
        key: string,
        owner: string,
        qualifiedName: string
    ): void {
        const previous = occupied.get(key);

        if (previous !== undefined) {
            throw new MetadataError(
                `Duplicate physical table "${qualifiedName}". ` +
                `Used by ${previous} and ${owner}.`
            );
        }

        occupied.set(key, owner);
    }

    private validateJoinTableColumns(
        source: EntityMetadata<any>,
        relation: RelationMetadata
    ): void {
        const joinTable = relation.joinTable;

        if (!joinTable) {
            return;
        }

        const names = new Set<string>();

        for (const column of [
            ...joinTable.joinColumns,
            ...joinTable.inverseJoinColumns
        ]) {
            if (names.has(column.name)) {
                throw new MetadataError(
                    `Duplicate join table column ` +
                    `"${column.name}" in ` +
                    `${source.target.name}.` +
                    `${String(relation.propertyKey)}.`
                );
            }

            names.add(column.name);
        }
    }

    private tableKey(
        schema: string | undefined,
        name: string
    ): string {
        return JSON.stringify([
            schema ?? null,
            name
        ]);
    }

    private qualifiedName(
        schema: string | undefined,
        name: string
    ): string {
        return schema === undefined
            ? name
            : `${schema}.${name}`;
    }


    private validatePropertyCollisions(
        item: OrmEntityMetadata
    ): void {
        const entity = item.entity;

        const columnProperties = new Set<string | symbol>(
            [
                ...entity.columns,
                ...entity.primaryKeys
            ].map(column => column.propertyKey)
        );

        for (const relation of item.relations) {
            if (columnProperties.has(relation.propertyKey)) {
                throw new MetadataError(
                    `Property "${String(relation.propertyKey)}" ` +
                    `in entity "${entity.target.name}" ` +
                    `cannot be mapped as both a column and a relation.`
                );
            }
        }
    }




    private validateForeignKeyTypes(
        item: OrmEntityMetadata,
        entities: ReadonlyMap<EntityTarget, OrmEntityMetadata>
    ): void {
        const source = item.entity;

        const sourceColumns = [
            ...source.primaryKeys,
            ...source.columns
        ];

        const sourceColumnMap = new Map(
            sourceColumns.map(column => [
                column.columnName,
                column
            ] as const)
        );

        for (const relation of item.relations) {
            if (!relation.isOwningSide) {
                continue;
            }

            if (relation.type === 'many-to-many') {
                continue;
            }

            const targetConstructor = relation.target();
            const target = entities.get(targetConstructor);

            if (!target) {
                throw new MetadataError(
                    `Target entity "${targetConstructor.name}" ` +
                    `for relation "${source.target.name}.` +
                    `${String(relation.propertyKey)}" ` +
                    `is not registered.`
                );
            }

            const primaryKeyMap = new Map(
                target.entity.primaryKeys.map(column => [
                    column.columnName,
                    column
                ] as const)
            );

            for (const joinColumn of relation.joinColumns) {
                const referencedColumn =
                    primaryKeyMap.get(
                        joinColumn.referencedColumnName
                    );

                if (!referencedColumn) {
                    throw new MetadataError(
                        `Invalid foreign key reference in ` +
                        `"${source.target.name}.` +
                        `${String(relation.propertyKey)}": ` +
                        `column "${joinColumn.referencedColumnName}" ` +
                        `is not a primary key of ` +
                        `"${targetConstructor.name}".`
                    );
                }

                const localColumn =
                    sourceColumnMap.get(joinColumn.name);

                // La FK inferida obtiene su tipo de la PK.
                if (!localColumn) {
                    continue;
                }

                if (localColumn.type !== referencedColumn.type) {
                    throw new MetadataError(
                        `Foreign key type mismatch in ` +
                        `"${source.target.name}.` +
                        `${String(relation.propertyKey)}": ` +
                        `local column "${joinColumn.name}" ` +
                        `(${localColumn.type}) references ` +
                        `"${targetConstructor.name}.` +
                        `${referencedColumn.columnName}" ` +
                        `(${referencedColumn.type}).`
                    );
                }
            }
        }
    }



    private validateSharedColumnWriteOwnership(
        item: OrmEntityMetadata
    ): void {
        const entity = item.entity;

        const scalarColumns = new Map(
            entity.columns.map(column => [
                column.columnName,
                column
            ] as const)
        );

        const primaryKeyNames = new Set(
            entity.primaryKeys.map(
                column => column.columnName
            )
        );

        for (const relation of item.relations) {
            if (!relation.isOwningSide) {
                continue;
            }

            // Las ManyToMany escriben en una tabla intermedia,
            // no directamente en la tabla de la entidad.
            if (relation.type === 'many-to-many') {
                continue;
            }

            for (const joinColumn of relation.joinColumns) {
                const columnName = joinColumn.name;

                // No admitimos todavía claves primarias
                // compartidas con relaciones (@MapsId).
                if (primaryKeyNames.has(columnName)) {
                    throw new MetadataError(
                        `Shared primary key column ` +
                        `"${columnName}" in relation ` +
                        `"${entity.target.name}.` +
                        `${String(relation.propertyKey)}" ` +
                        `requires explicit shared-key mapping.`
                    );
                }

                const scalarColumn =
                    scalarColumns.get(columnName);

                // Si no existe representación escalar,
                // la relación es la única propietaria.
                if (!scalarColumn) {
                    continue;
                }

                // Si no se especifican, los indicadores
                // de escritura se consideran habilitados.
                const insertable =
                    scalarColumn.insertable !== false;

                const updatable =
                    scalarColumn.updatable !== false;

                if (insertable || updatable) {
                    const operations = [
                        ...(insertable ? ['INSERT'] : []),
                        ...(updatable ? ['UPDATE'] : [])
                    ].join(' and ');

                    throw new MetadataError(
                        `Shared column write conflict in ` +
                        `"${entity.target.name}.` +
                        `${String(relation.propertyKey)}": ` +
                        `column "${columnName}" is writable ` +
                        `by both the scalar property ` +
                        `"${String(scalarColumn.propertyKey)}" ` +
                        `and the relation during ${operations}. ` +
                        `Set insertable: false and ` +
                        `updatable: false on the scalar column.`
                    );
                }
            }
        }
    }




}
