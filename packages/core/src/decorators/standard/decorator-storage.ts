
import type {
    ColumnOptions,
    EntityOptions,
    PrimaryKeyOptions
} from '../../metadata/contracts';

export interface ColumnDeclaration {
    readonly propertyKey: string | symbol;
    readonly options: ColumnOptions;
}

export interface PrimaryKeyDeclaration {
    readonly propertyKey: string | symbol;
    readonly options: PrimaryKeyOptions;
}

export const ENTITY_OPTIONS = Symbol('tyorm:entity-options');
export const COLUMNS = Symbol('tyorm:columns');
export const PRIMARY_KEYS = Symbol('tyorm:primary-keys');

type DeclarationKey =
    | typeof COLUMNS
    | typeof PRIMARY_KEYS;

type Declaration =
    | ColumnDeclaration
    | PrimaryKeyDeclaration;

export function appendDeclaration(
    metadata: DecoratorMetadataObject,
    key: DeclarationKey,
    declaration: Declaration
): void {
    const existing = Object.hasOwn(metadata, key)
        ? metadata[key] as readonly Declaration[]
        : [];

    metadata[key] = [...existing, declaration];
}

export function getOwnDeclarations<T extends Declaration>(
    metadata: DecoratorMetadataObject,
    key: DeclarationKey
): readonly T[] {
    if (!Object.hasOwn(metadata, key)) {
        return [];
    }

    return metadata[key] as readonly T[];
}

export function getOwnEntityOptions(
    metadata: DecoratorMetadataObject
): EntityOptions | undefined {
    if (!Object.hasOwn(metadata, ENTITY_OPTIONS)) {
        return undefined;
    }

    return metadata[ENTITY_OPTIONS] as EntityOptions;
}
