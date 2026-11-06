
import type {
    ColumnMetadata,
    ColumnType,
    EntityMetadata,
    EntityTarget,
    PrimaryKeyMetadata
} from './contracts';

import { MetadataError } from './metadata-error';

type AnyEntityMetadata = EntityMetadata<any>;

const COLUMN_TYPES: ReadonlySet<ColumnType> = new Set([
    'string',
    'text',
    'integer',
    'bigint',
    'decimal',
    'float',
    'boolean',
    'date',
    'time',
    'datetime',
    'uuid',
    'json',
    'binary'
]);

export class MetadataRegistry {
    private readonly entities =
        new Map<EntityTarget, AnyEntityMetadata>();

    private readonly tables =
        new Map<string, EntityTarget>();

    register<T extends object>(
        metadata: EntityMetadata<T>
    ): void {
        this.validate(metadata);

        if (this.entities.has(metadata.target)) {
            throw new MetadataError(
                `Entity "${metadata.target.name}" is already registered.`
            );
        }

        const tableKey = this.getTableKey(metadata);
        const existingTarget = this.tables.get(tableKey);

        if (existingTarget) {
            throw new MetadataError(
                `Table "${this.getQualifiedTableName(metadata)}" ` +
                `is already mapped to entity "${existingTarget.name}".`
            );
        }

        const snapshot = this.createSnapshot(metadata);

        this.entities.set(metadata.target, snapshot);
        this.tables.set(tableKey, metadata.target);
    }

    get<T extends object>(
        target: EntityTarget<T>
    ): EntityMetadata<T> {
        const metadata = this.entities.get(target);

        if (!metadata) {
            throw new MetadataError(
                `Entity "${target.name}" is not registered.`
            );
        }

        return metadata as EntityMetadata<T>;
    }

    find<T extends object>(
        target: EntityTarget<T>
    ): EntityMetadata<T> | undefined {
        return this.entities.get(target) as
            | EntityMetadata<T>
            | undefined;
    }

    has(target: EntityTarget): boolean {
        return this.entities.has(target);
    }

    getAll(): readonly AnyEntityMetadata[] {
        return Object.freeze([...this.entities.values()]);
    }

    getColumns(
        target: EntityTarget
    ): readonly ColumnMetadata[] {
        const metadata = this.get(target);

        return Object.freeze([
            ...metadata.primaryKeys,
            ...metadata.columns
        ]);
    }

    getColumn(
        target: EntityTarget,
        propertyKey: string | symbol
    ): ColumnMetadata {
        const column = this.getColumns(target).find(
            item => item.propertyKey === propertyKey
        );

        if (!column) {
            throw new MetadataError(
                `Column "${String(propertyKey)}" ` +
                `does not exist in entity "${target.name}".`
            );
        }

        return column;
    }

    get size(): number {
        return this.entities.size;
    }

    private validate<T extends object>(
        metadata: EntityMetadata<T>
    ): void {
        if (typeof metadata.target !== 'function') {
            throw new MetadataError(
                'Entity target must be a class constructor.'
            );
        }

        this.validateIdentifier(metadata.tableName, 'Table name');

        if (metadata.schema !== undefined) {
            this.validateIdentifier(metadata.schema, 'Schema name');
        }

        if (!Array.isArray(metadata.columns)) {
            throw new MetadataError(
                'Entity columns must be an array.'
            );
        }

        if (!Array.isArray(metadata.primaryKeys)) {
            throw new MetadataError(
                'Entity primaryKeys must be an array.'
            );
        }

        if (metadata.primaryKeys.length === 0) {
            throw new MetadataError(
                `Entity "${metadata.target.name}" must have a primary key.`
            );
        }

        const propertyKeys = new Set<string | symbol>();
        const columnNames = new Set<string>();

        for (const column of [
            ...metadata.columns,
            ...metadata.primaryKeys
        ]) {
            this.validateColumn(column);

            if (propertyKeys.has(column.propertyKey)) {
                throw new MetadataError(
                    `Duplicate property "${String(column.propertyKey)}" ` +
                    `in entity "${metadata.target.name}".`
                );
            }

            if (columnNames.has(column.columnName)) {
                throw new MetadataError(
                    `Duplicate database column "${column.columnName}" ` +
                    `in entity "${metadata.target.name}".`
                );
            }

            propertyKeys.add(column.propertyKey);
            columnNames.add(column.columnName);
        }

        for (const primaryKey of metadata.primaryKeys) {
            this.validatePrimaryKey(primaryKey);
        }

        if (
            metadata.primaryKeys.length > 1 &&
            metadata.primaryKeys.some(
                key => key.generation === 'increment'
            )
        ) {
            throw new MetadataError(
                'Increment generation is not supported ' +
                'for composite primary keys.'
            );
        }
    }

    private validateColumn(
        column: ColumnMetadata
    ): void {
        if (
            typeof column.propertyKey !== 'string' &&
            typeof column.propertyKey !== 'symbol'
        ) {
            throw new MetadataError(
                'Column propertyKey must be a string or symbol.'
            );
        }

        if (
            typeof column.propertyKey === 'string' &&
            column.propertyKey.trim().length === 0
        ) {
            throw new MetadataError(
                'Column propertyKey cannot be empty.'
            );
        }

        this.validateIdentifier(column.columnName, 'Column name');

        if (!COLUMN_TYPES.has(column.type)) {
            throw new MetadataError(
                `Unsupported column type "${String(column.type)}".`
            );
        }

        if (
            typeof column.nullable !== 'boolean' ||
            typeof column.hasDefault !== 'boolean' ||
            typeof column.insertable !== 'boolean' ||
            typeof column.updatable !== 'boolean'
        ) {
            throw new MetadataError(
                `Column "${column.columnName}" has invalid boolean options.`
            );
        }

        if (column.length !== undefined) {
            if (
                column.type !== 'string' ||
                !Number.isSafeInteger(column.length) ||
                column.length <= 0
            ) {
                throw new MetadataError(
                    `Column "${column.columnName}" has an invalid length.`
                );
            }
        }

        if (
            column.precision !== undefined ||
            column.scale !== undefined
        ) {
            if (column.type !== 'decimal') {
                throw new MetadataError(
                    `Precision and scale require a decimal column.`
                );
            }

            if (
                !Number.isSafeInteger(column.precision) ||
                column.precision! <= 0
            ) {
                throw new MetadataError(
                    `Column "${column.columnName}" requires valid precision.`
                );
            }

            if (
                column.scale !== undefined &&
                (
                    !Number.isSafeInteger(column.scale) ||
                    column.scale < 0 ||
                    column.scale > column.precision!
                )
            ) {
                throw new MetadataError(
                    `Column "${column.columnName}" has an invalid scale.`
                );
            }
        }

        if (!column.hasDefault && column.defaultValue !== undefined) {
            throw new MetadataError(
                `Column "${column.columnName}" has a defaultValue ` +
                `but hasDefault is false.`
            );
        }
    }

    private validatePrimaryKey(
        key: PrimaryKeyMetadata
    ): void {
        if (key.nullable !== false) {
            throw new MetadataError(
                `Primary key "${key.columnName}" cannot be nullable.`
            );
        }

        if (key.updatable !== false) {
            throw new MetadataError(
                `Primary key "${key.columnName}" cannot be updatable.`
            );
        }

        if (
            !['none', 'increment', 'uuid'].includes(key.generation)
        ) {
            throw new MetadataError(
                `Invalid primary key generation strategy.`
            );
        }

        if (
            key.generation === 'increment' &&
            !['integer', 'bigint'].includes(key.type)
        ) {
            throw new MetadataError(
                `Increment generation requires integer or bigint.`
            );
        }

        if (
            key.generation === 'uuid' &&
            key.type !== 'uuid'
        ) {
            throw new MetadataError(
                `UUID generation requires a uuid column.`
            );
        }
    }

    private validateIdentifier(
        value: string,
        label: string
    ): void {
        if (
            typeof value !== 'string' ||
            value.trim().length === 0 ||
            value.includes('\0')
        ) {
            throw new MetadataError(
                `${label} must be a non-empty valid identifier.`
            );
        }
    }

    private getQualifiedTableName(
        metadata: AnyEntityMetadata
    ): string {
        return metadata.schema === undefined
            ? metadata.tableName
            : `${metadata.schema}.${metadata.tableName}`;
    }

    private getTableKey(
        metadata: AnyEntityMetadata
    ): string {
        return JSON.stringify([
            metadata.schema ?? null,
            metadata.tableName
        ]);
    }


    private createSnapshot<T extends object>(
        metadata: EntityMetadata<T>
    ): EntityMetadata<T> {
        const columns = metadata.columns.map(
            column => Object.freeze({ ...column })
        );

        const primaryKeys = metadata.primaryKeys.map(
            key => Object.freeze({ ...key })
        );

        return Object.freeze({
            target: metadata.target,
            tableName: metadata.tableName,

            ...(metadata.schema !== undefined
                ? { schema: metadata.schema }
                : {}),

            columns: Object.freeze(columns),
            primaryKeys: Object.freeze(primaryKeys)
        });
    }

}
