
import type {
    JoinColumnMetadata,
    JoinColumnOptions
} from './join-column-metadata';

export interface JoinTableOptions {
    /**
     * Nombre de la tabla intermedia.
     */
    readonly name?: string;

    /**
     * Esquema de la tabla intermedia.
     */
    readonly schema?: string;

    /**
     * Columnas que referencian a la entidad
     * propietaria de la relación.
     */
    readonly joinColumns?: readonly JoinColumnOptions[];

    /**
     * Columnas que referencian a la entidad
     * del otro extremo.
     */
    readonly inverseJoinColumns?: readonly JoinColumnOptions[];
}

export interface JoinTableMetadata {
    readonly name: string;
    readonly schema?: string;

    readonly joinColumns: readonly JoinColumnMetadata[];

    readonly inverseJoinColumns: readonly JoinColumnMetadata[];
}
