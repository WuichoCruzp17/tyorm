
export interface JoinColumnOptions {
    /**
     * Nombre de la columna local que contiene
     * la clave foránea.
     *
     * Ejemplo: user_id
     */
    readonly name?: string;

    /**
     * Nombre de la columna referenciada
     * en la entidad destino.
     *
     * Ejemplo: id
     */
    readonly referencedColumnName?: string;
}

export interface JoinColumnMetadata {
    /**
     * Nombre físico de la columna local.
     */
    readonly name: string;

    /**
     * Nombre físico de la columna destino.
     */
    readonly referencedColumnName: string;
}
