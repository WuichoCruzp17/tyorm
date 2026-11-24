
import type {
    EntityTarget
} from '../../metadata/contracts';

import { MetadataError } from '../../metadata/metadata-error';

import {
    JOIN_COLUMNS,
    JOIN_TABLES,
    RELATIONS,
    getOwnDeclarations
} from './decorator-storage';

import type {
    JoinColumnDeclaration,
    JoinTableDeclaration,
    RelationDeclaration
} from './relation-declaration';

export interface EntityRelationDeclarations {
    readonly relations: readonly RelationDeclaration[];
    readonly joinColumns: readonly JoinColumnDeclaration[];
    readonly joinTables: readonly JoinTableDeclaration[];
}

export function getRelationDeclarations(
    target: EntityTarget
): EntityRelationDeclarations {
    const metadataSymbol = Symbol.metadata;

    if (metadataSymbol === undefined) {
        throw new MetadataError(
            'Symbol.metadata is unavailable. ' +
            'Import "@tyorm/core/register" before loading decorated entities.'
        );
    }

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

    const relations: RelationDeclaration[] = [];
    const joinColumns: JoinColumnDeclaration[] = [];
    const joinTables: JoinTableDeclaration[] = [];

    for (const metadata of chain) {
        relations.push(
            ...getOwnDeclarations<RelationDeclaration>(
                metadata,
                RELATIONS
            )
        );

        joinColumns.push(
            ...getOwnDeclarations<JoinColumnDeclaration>(
                metadata,
                JOIN_COLUMNS
            )
        );

        joinTables.push(
            ...getOwnDeclarations<JoinTableDeclaration>(
                metadata,
                JOIN_TABLES
            )
        );
    }

    return {
        relations,
        joinColumns,
        joinTables
    };
}
