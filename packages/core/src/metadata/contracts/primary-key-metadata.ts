
import type {
    ColumnMetadata,
    ColumnOptions
} from './column-metadata';

export type PrimaryKeyGenerationStrategy =
    | 'none'
    | 'increment'
    | 'uuid';

export interface PrimaryKeyOptions
    extends Omit<ColumnOptions, 'nullable' | 'updatable'> {

    /**
     * Estrategia de generación.
     *
     * none: valor asignado manualmente.
     * increment: generado por la BD.
     * uuid: generación de identificador UUID.
     */
    generation?: PrimaryKeyGenerationStrategy;
}

export interface PrimaryKeyMetadata
    extends ColumnMetadata {

    readonly nullable: false;
    readonly updatable: false;

    readonly generation: PrimaryKeyGenerationStrategy;
}
