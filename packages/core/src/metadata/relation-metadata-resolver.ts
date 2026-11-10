
import type {
    EntityMetadata,
    EntityTarget,
    JoinColumnMetadata,
    JoinColumnOptions,
    JoinTableMetadata,
    RelationMetadata,
    RelationType
} from './contracts';

import { MetadataError } from './metadata-error';

import {
    getRelationDeclarations
} from '../decorators/standard/get-relation-declarations';

import type {
    RelationDeclaration
} from '../decorators/standard/relation-declaration';

import {
    freezeRelationMetadata
} from './freeze-relation-metadata';


type EntityDefinition = EntityMetadata<any>;

export interface ResolvedEntityRelations {
    readonly target: EntityTarget;
    readonly relations: readonly RelationMetadata[];
}

export class RelationMetadataResolver {
    private readonly entities =
        new Map<EntityTarget, EntityDefinition>();

    constructor(
        entities: readonly EntityDefinition[]
    ) {
        for (const entity of entities) {
            if (this.entities.has(entity.target)) {
                throw new MetadataError(
                    `Duplicate entity: ${entity.target.name}`
                );
            }

            this.entities.set(entity.target, entity);
        }
    }



    resolve(
        target: EntityTarget
    ): ResolvedEntityRelations {
        const entity = this.requireEntity(target);
        const declarations = getRelationDeclarations(target);
        const relationKeys = new Set<string | symbol>();

        // 1. Validar relaciones duplicadas
        for (const relation of declarations.relations) {
            if (relationKeys.has(relation.propertyKey)) {
                throw new MetadataError(
                    `Duplicate relation property: ${String(relation.propertyKey)}`
                );
            }

            relationKeys.add(relation.propertyKey);
        }

        // 2. Validar configuraciones Join sin relación
        for (const join of [
            ...declarations.joinColumns,
            ...declarations.joinTables
        ]) {
            if (!relationKeys.has(join.propertyKey)) {
                throw new MetadataError(
                    `Join configuration without relation: ` +
                    String(join.propertyKey)
                );
            }
        }

        // 3. Resolver relaciones
        const relations = declarations.relations.map(
            declaration => this.resolveRelation(
                entity,
                declaration
            )
        );

        // 4. Validar propietarios y acciones referenciales
        for (const relation of relations) {
            this.validateRelationOwnership(entity, relation);
            this.validateReferentialOptions(entity, relation);
        }

        // 5. NUEVO: Detectar columnas locales duplicadas
        this.validateLocalJoinColumnCollisions(
            entity,
            relations
        );
        // NUEVO: Validar colisiones con columnas físicas
        this.validatePhysicalColumnCollisions(
            entity,
            relations
        );

        // 6. Congelar los metadatos
        const frozenRelations = Object.freeze(
            relations.map(freezeRelationMetadata)
        );

        // 7. Devolver resultado inmutable
        return Object.freeze({
            target,
            relations: frozenRelations
        });
    }



    resolveAll(): readonly ResolvedEntityRelations[] {
        return Object.freeze(
            [...this.entities.keys()].map(
                target => this.resolve(target)
            )
        );
    }

    private requireEntity(
        target: EntityTarget
    ): EntityDefinition {
        const entity = this.entities.get(target);

        if (!entity) {
            throw new MetadataError(
                `Entity "${target.name}" is not registered for resolution.`
            );
        }

        return entity;
    }

    private resolveRelation(
        source: EntityDefinition,
        declaration: RelationDeclaration
    ): RelationMetadata {
        const destinationTarget = declaration.target();
        const destination = this.requireEntity(destinationTarget);

        const declarations =
            getRelationDeclarations(source.target);

        const joins = declarations.joinColumns.filter(
            item => item.propertyKey === declaration.propertyKey
        );

        const tables = declarations.joinTables.filter(
            item => item.propertyKey === declaration.propertyKey
        );

        if (joins.length > 1 || tables.length > 1) {
            throw new MetadataError(
                `Duplicate join configuration for ` +
                `${source.target.name}.${String(declaration.propertyKey)}`
            );
        }

        if (joins.length && tables.length) {
            throw new MetadataError(
                'A relation cannot use both @JoinColumn and @JoinTable.'
            );
        }

        if (
            joins.length &&
            !['many-to-one', 'one-to-one'].includes(declaration.type)
        ) {
            throw new MetadataError(
                '@JoinColumn requires ManyToOne or OneToOne.'
            );
        }

        if (
            tables.length &&
            declaration.type !== 'many-to-many'
        ) {
            throw new MetadataError(
                '@JoinTable requires ManyToMany.'
            );
        }

        const inversePropertyKey =
            this.resolveInverse(declaration);

        this.validateInverseRelation(
            source,
            destination,
            declaration,
            inversePropertyKey
        );

        const owning = this.isOwningSide(
            declaration.type,
            joins.length > 0,
            tables.length > 0
        );

        const joinColumns = owning &&
            declaration.type !== 'many-to-many'
            ? this.resolveJoinColumns(
                joins[0]?.columns,
                destination,
                declaration.propertyKey
            )
            : [];

        const joinTable = tables[0]
            ? this.resolveJoinTable(
                tables[0].options,
                source,
                destination
            )
            : undefined;

        return {
            propertyKey: declaration.propertyKey,
            type: declaration.type,
            target: declaration.target,
            ...(inversePropertyKey !== undefined
                ? { inversePropertyKey }
                : {}),
            isOwningSide: owning,
            nullable: declaration.options.nullable ?? true,
            ...(declaration.options.onDelete !== undefined
                ? { onDelete: declaration.options.onDelete }
                : {}),
            ...(declaration.options.onUpdate !== undefined
                ? { onUpdate: declaration.options.onUpdate }
                : {}),
            joinColumns,
            ...(joinTable !== undefined ? { joinTable } : {})
        };
    }

    private resolveInverse(
        declaration: RelationDeclaration
    ): string | symbol | undefined {
        if (declaration.inverse === undefined) {
            return undefined;
        }

        if (typeof declaration.inverse === 'function') {
            throw new MetadataError(
                'Function inverse selectors are not yet supported. ' +
                'Use a property name such as "orders".'
            );
        }

        return declaration.inverse;
    }

    private isOwningSide(
        type: RelationType,
        hasJoinColumns: boolean,
        hasJoinTable: boolean
    ): boolean {
        switch (type) {
            case 'many-to-one':
                return true;

            case 'one-to-many':
                return false;

            case 'one-to-one':
                return hasJoinColumns;

            case 'many-to-many':
                return hasJoinTable;
        }
    }



    private resolveJoinColumns(
        options: readonly JoinColumnOptions[] | undefined,
        destination: EntityDefinition,
        propertyKey?: string | symbol
    ): readonly JoinColumnMetadata[] {
        const primaryKeys = destination.primaryKeys;

        if (primaryKeys.length === 0) {
            throw new MetadataError(
                `Entity ${destination.target.name} has no primary key.`
            );
        }

        const columns = options ?? primaryKeys.map(key => ({
            name: propertyKey !== undefined
                ? `${String(propertyKey)}_${key.columnName}`
                : key.columnName,
            referencedColumnName: key.columnName
        }));

        if (columns.length !== primaryKeys.length) {
            throw new MetadataError(
                `Join columns must reference the complete primary key ` +
                `of ${destination.target.name}.`
            );
        }

        const resolved = columns.map((option, index) => {
            const referencedColumnName =
                option.referencedColumnName ??
                primaryKeys[index]?.columnName;

            if (referencedColumnName === undefined) {
                throw new MetadataError(
                    'Cannot infer referenced join column.'
                );
            }

            const name = option.name ?? referencedColumnName;

            this.validateDatabaseIdentifier(
                name,
                'Join column name'
            );

            this.validateDatabaseIdentifier(
                referencedColumnName,
                'Referenced column name'
            );

            if (!primaryKeys.some(
                key => key.columnName === referencedColumnName
            )) {
                throw new MetadataError(
                    `Referenced column "${referencedColumnName}" ` +
                    `is not a primary key of ${destination.target.name}.`
                );
            }

            return {
                name,
                referencedColumnName
            };
        });

        const localNames = new Set(
            resolved.map(column => column.name)
        );

        const referencedNames = new Set(
            resolved.map(column => column.referencedColumnName)
        );

        if (
            localNames.size !== resolved.length ||
            referencedNames.size !== resolved.length
        ) {
            throw new MetadataError(
                'Duplicate join column names are not allowed.'
            );
        }

        return Object.freeze(
            resolved.map(column => Object.freeze(column))
        );
    }




    private resolveJoinTable(
        options: {
            readonly name?: string;
            readonly schema?: string;
            readonly joinColumns?: readonly JoinColumnOptions[];
            readonly inverseJoinColumns?: readonly JoinColumnOptions[];
        },
        source: EntityDefinition,
        destination: EntityDefinition
    ): JoinTableMetadata {

        const name =
            options.name ??
            `${source.tableName}_${destination.tableName}`;

        // NUEVO: Validar el nombre de la tabla intermedia
        this.validateDatabaseIdentifier(
            name,
            'Join table name'
        );

        // NUEVO: Validar el esquema cuando esté definido
        if (options.schema !== undefined) {
            this.validateDatabaseIdentifier(
                options.schema,
                'Join table schema'
            );
        }

        // EXISTENTE: Resolver las columnas del propietario
        const joinColumns = this.resolveJoinColumns(
            options.joinColumns,
            source
        );

        // EXISTENTE: Resolver las columnas de la entidad destino
        const inverseJoinColumns = this.resolveJoinColumns(
            options.inverseJoinColumns,
            destination
        );

        return {
            name,
            ...(options.schema !== undefined
                ? { schema: options.schema }
                : {}),
            joinColumns,
            inverseJoinColumns
        };
    }



    private validateInverseRelation(
        source: EntityDefinition,
        destination: EntityDefinition,
        declaration: RelationDeclaration,
        inversePropertyKey: string | symbol | undefined
    ): void {
        if (inversePropertyKey === undefined) {
            return;
        }

        const destinationDeclarations =
            getRelationDeclarations(destination.target);

        const inverse = destinationDeclarations.relations.find(
            relation => relation.propertyKey === inversePropertyKey
        );

        if (!inverse) {
            throw new MetadataError(
                `Inverse relation "${String(inversePropertyKey)}" ` +
                `does not exist in ${destination.target.name}.`
            );
        }

        const expected: Record<RelationType, RelationType> = {
            'one-to-one': 'one-to-one',
            'one-to-many': 'many-to-one',
            'many-to-one': 'one-to-many',
            'many-to-many': 'many-to-many'
        };

        if (inverse.type !== expected[declaration.type]) {
            throw new MetadataError(
                `Incompatible inverse relation: ` +
                `${source.target.name}.${String(declaration.propertyKey)} ` +
                `and ${destination.target.name}.${String(inversePropertyKey)}.`
            );
        }

        if (inverse.target() !== source.target) {
            throw new MetadataError(
                `Inverse relation "${String(inversePropertyKey)}" ` +
                `does not target ${source.target.name}.`
            );
        }

        if (
            inverse.inverse !== undefined &&
            (
                typeof inverse.inverse === 'function' ||
                inverse.inverse !== declaration.propertyKey
            )
        ) {
            throw new MetadataError(
                'Inverse relation points to a different property.'
            );
        }
    }


    private validateRelationOwnership(
        source: EntityDefinition,
        relation: RelationMetadata
    ): void {
        if (
            relation.type !== 'one-to-one' &&
            relation.type !== 'many-to-many'
        ) {
            return;
        }

        if (relation.inversePropertyKey === undefined) {
            // Una relación unidireccional necesita propietario.
            if (!relation.isOwningSide) {
                throw new MetadataError(
                    `Unidirectional ${relation.type} relation ` +
                    `${source.target.name}.${String(relation.propertyKey)} ` +
                    `must be the owning side.`
                );
            }

            return;
        }

        const destinationTarget = relation.target();
        const destination = this.requireEntity(destinationTarget);

        const inverseDeclarations =
            getRelationDeclarations(destination.target);

        const inverse = inverseDeclarations.relations.find(
            item =>
                item.propertyKey === relation.inversePropertyKey
        );

        if (!inverse) {
            throw new MetadataError(
                `Inverse relation not found: ` +
                `${destination.target.name}.` +
                String(relation.inversePropertyKey)
            );
        }

        const inverseJoins = inverseDeclarations.joinColumns.some(
            item => item.propertyKey === inverse.propertyKey
        );

        const inverseTables = inverseDeclarations.joinTables.some(
            item => item.propertyKey === inverse.propertyKey
        );

        const inverseOwning =
            relation.type === 'one-to-one'
                ? inverseJoins
                : inverseTables;

        if (relation.isOwningSide === inverseOwning) {
            const reason = relation.isOwningSide
                ? 'Both sides are configured as owners.'
                : 'Neither side is configured as owner.';

            throw new MetadataError(
                `Invalid ${relation.type} ownership between ` +
                `${source.target.name}.${String(relation.propertyKey)} ` +
                `and ${destination.target.name}.` +
                `${String(inverse.propertyKey)}. ${reason}`
            );
        }
    }



    private validateReferentialOptions(
        source: EntityDefinition,
        relation: RelationMetadata
    ): void {
        if (
            relation.isOwningSide ||
            (
                relation.onDelete === undefined &&
                relation.onUpdate === undefined
            )
        ) {
            return;
        }

        throw new MetadataError(
            `Referential actions are not allowed on the inverse side: ` +
            `${source.target.name}.${String(relation.propertyKey)}`
        );
    }



    private validateDatabaseIdentifier(
        value: string,
        description: string
    ): void {
        if (value.length === 0 || value.trim().length === 0) {
            throw new MetadataError(
                `${description} cannot be empty.`
            );
        }

        if (value !== value.trim()) {
            throw new MetadataError(
                `${description} cannot contain leading or trailing whitespace.`
            );
        }

        if (value.includes('\0')) {
            throw new MetadataError(
                `${description} cannot contain null characters.`
            );
        }
    }


    private validateLocalJoinColumnCollisions(
        source: EntityDefinition,
        relations: readonly RelationMetadata[]
    ): void {
        const usedColumns = new Map<string, string | symbol>();

        for (const relation of relations) {
            if (!relation.isOwningSide) {
                continue;
            }

            // Las columnas de ManyToMany pertenecen
            // a una tabla intermedia.
            if (relation.type === 'many-to-many') {
                continue;
            }

            for (const column of relation.joinColumns) {
                if (usedColumns.has(column.name)) {
                    const previous = usedColumns.get(column.name);

                    throw new MetadataError(
                        `Duplicate local join column "${column.name}" ` +
                        `in entity ${source.target.name}. ` +
                        `Used by relations ${String(previous)} and ` +
                        `${String(relation.propertyKey)}.`
                    );
                }

                usedColumns.set(
                    column.name,
                    relation.propertyKey
                );
            }
        }
    }



    private hasExplicitJoinColumnName(
        target: EntityTarget,
        propertyKey: string | symbol,
        columnName: string
    ): boolean {
        const declarations = getRelationDeclarations(target);

        const join = declarations.joinColumns.find(
            item => item.propertyKey === propertyKey
        );

        if (!join) {
            return false;
        }

        return join.columns.some(
            column => column.name === columnName
        );
    }


    private validatePhysicalColumnCollisions(
        source: EntityDefinition,
        relations: readonly RelationMetadata[]
    ): void {
        const physicalColumns = new Map(
            source.columns.map(column => [
                column.columnName,
                column
            ] as const)
        );

        const primaryKeyColumns = new Set(
            source.primaryKeys.map(key => key.columnName)
        );

        for (const relation of relations) {
            if (!relation.isOwningSide) {
                continue;
            }

            if (relation.type === 'many-to-many') {
                continue;
            }

            for (const join of relation.joinColumns) {
                if (primaryKeyColumns.has(join.name)) {
                    throw new MetadataError(
                        `Foreign key column "${join.name}" ` +
                        `conflicts with a primary key in ` +
                        `${source.target.name}.`
                    );
                }

                const existing = physicalColumns.get(join.name);

                if (!existing) {
                    continue;
                }

                const explicit = this.hasExplicitJoinColumnName(
                    source.target,
                    relation.propertyKey,
                    join.name
                );

                if (!explicit) {
                    throw new MetadataError(
                        `Inferred foreign key column "${join.name}" ` +
                        `conflicts with an existing column in ` +
                        `${source.target.name}. ` +
                        `Use @JoinColumn to declare the mapping explicitly.`
                    );
                }

                // La asociación explícita se permite por ahora.
                // La compatibilidad de tipos y escritura se
                // comprobará en una fase posterior.
            }
        }
    }

}
