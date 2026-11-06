
import type { ColumnType } from './column-type';

export interface ColumnOptions {
    /**
     * Tipo lógico de la columna.
     */
    type: ColumnType;

    /**
     * Nombre físico de la columna en la BD.
     * Si se omite, utilizaremos el nombre de la propiedad.
     */
    name?: string;

    /**
     * Permite valores NULL.
     * Por defecto: false.
     */
    nullable?: boolean;

    /**
     * Longitud máxima para tipos compatibles.
     */
    length?: number;

    /**
     * Precisión total para tipos decimales.
     */
    precision?: number;

    /**
     * Número de posiciones decimales.
     */
    scale?: number;

    /**
     * Valor predeterminado definido por el ORM.
     * No representa una expresión SQL.
     */
    default?: unknown;

    /**
     * Indica si existe un valor predeterminado.
     * Permite distinguir entre ausencia de default
     * y un default explícito de undefined.
     */
    hasDefault?: boolean;

    /**
     * Permite excluir la columna de operaciones
     * de inserción o actualización.
     */
    insertable?: boolean;
    updatable?: boolean;
}

export interface ColumnMetadata {
    /**
     * Propiedad de la clase TypeScript.
     */
    readonly propertyKey: string | symbol;

    /**
     * Nombre físico de la columna.
     */
    readonly columnName: string;

    readonly type: ColumnType;

    readonly nullable: boolean;

    readonly length?: number;
    readonly precision?: number;
    readonly scale?: number;

    readonly hasDefault: boolean;
    readonly defaultValue?: unknown;

    readonly insertable: boolean;
    readonly updatable: boolean;
}
