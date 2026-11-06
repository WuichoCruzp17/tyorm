
import type { ColumnMetadata } from './column-metadata';
import type { PrimaryKeyMetadata } from './primary-key-metadata';

/**
 * Constructor de una clase que representa
 * una entidad de TyORM.
 */
export type EntityTarget<T extends object = object> =
    abstract new (...args: any[]) => T;

export interface EntityOptions {
    /**
     * Nombre físico de la tabla.
     */
    name?: string;

    /**
     * Esquema de la base de datos.
     */
    schema?: string;
}

export interface EntityMetadata<T extends object = object> {
    /**
     * Clase asociada a la entidad.
     */
    readonly target: EntityTarget<T>;

    /**
     * Nombre físico de la tabla.
     */
    readonly tableName: string;

    /**
     * Esquema explícito, si fue configurado.
     */
    readonly schema?: string;

    /**
     * Columnas normales de la entidad.
     * No incluye las claves primarias.
     */
    readonly columns: readonly ColumnMetadata[];

    /**
     * Una o varias claves primarias.
     */
    readonly primaryKeys: readonly PrimaryKeyMetadata[];
}
