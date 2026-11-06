
import type {
    ColumnMetadata,
    ColumnOptions,
    EntityMetadata,
    EntityTarget,
    PrimaryKeyMetadata,
    PrimaryKeyOptions
} from '../../metadata/contracts';

import { MetadataError } from '../../metadata/metadata-error';

import {
    COLUMNS,
    PRIMARY_KEYS,
    getOwnDeclarations,
    getOwnEntityOptions,
    type ColumnDeclaration,
    type PrimaryKeyDeclaration
} from './decorator-storage';

function getMetadataChain(
    target: EntityTarget
): DecoratorMetadataObject[] {
    if (Symbol.metadata === undefined) {
        throw new MetadataError(
            'Symbol.metadata is unavailable. ' +
            'Initialize it before loading decorated entities.'
        );
    }

    const metadataSymbol = Symbol.metadata;
    const chain: DecoratorMetadataObject[] = [];

    let current: object | null = target;

    while (current !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(
            current,
            metadataSymbol
        );

        if (descriptor?.value !== undefined) {
            chain.unshift(
                descriptor.value as DecoratorMetadataObject
            );
        }

        current = Object.getPrototypeOf(current);
    }

    return chain;
}

function normalizeColumn(
    propertyKey: string | symbol,
    options: ColumnOptions
): ColumnMetadata {
    const hasDefault =
        options.hasDefault ??
        Object.hasOwn(options, 'default');

    return {
        propertyKey,
        columnName: options.name ?? String(propertyKey),
        type: options.type,
        nullable: options.nullable ?? false,
        hasDefault,
        ...(hasDefault
            ? { defaultValue: options.default }
            : {}),
        ...(options.length !== undefined
            ? { length: options.length }
            : {}),
        ...(options.precision !== undefined
            ? { precision: options.precision }
            : {}),
        ...(options.scale !== undefined
            ? { scale: options.scale }
            : {}),
        insertable: options.insertable ?? true,
        updatable: options.updatable ?? true
    };
}

function normalizePrimaryKey(
    propertyKey: string | symbol,
    options: PrimaryKeyOptions
): PrimaryKeyMetadata {
    return {
        ...normalizeColumn(propertyKey, {
            ...options,
            nullable: false,
            updatable: false
        }),
        nullable: false,
        updatable: false,
        generation: options.generation ?? 'none'
    };
}

export function getEntityMetadata<T extends object>(
    target: EntityTarget<T>
): EntityMetadata<T> {
    const chain = getMetadataChain(target);

    const ownMetadata = chain.at(-1);

    if (!ownMetadata) {
        throw new MetadataError(
            `Entity "${target.name}" has no decorator metadata.`
        );
    }

    const entityOptions = getOwnEntityOptions(ownMetadata);

    if (!entityOptions) {
        throw new MetadataError(
            `Class "${target.name}" is not decorated with @Entity.`
        );
    }

    const columns: ColumnMetadata[] = [];
    const primaryKeys: PrimaryKeyMetadata[] = [];

    for (const metadata of chain) {
        const columnDeclarations =
            getOwnDeclarations<ColumnDeclaration>(
                metadata,
                COLUMNS
            );

        const primaryKeyDeclarations =
            getOwnDeclarations<PrimaryKeyDeclaration>(
                metadata,
                PRIMARY_KEYS
            );

        for (const declaration of columnDeclarations) {
            columns.push(
                normalizeColumn(
                    declaration.propertyKey,
                    declaration.options
                )
            );
        }

        for (const declaration of primaryKeyDeclarations) {
            primaryKeys.push(
                normalizePrimaryKey(
                    declaration.propertyKey,
                    declaration.options
                )
            );
        }
    }

    return {
        target,
        tableName: entityOptions.name ?? target.name,
        ...(entityOptions.schema !== undefined
            ? { schema: entityOptions.schema }
            : {}),
        columns,
        primaryKeys
    };
}
