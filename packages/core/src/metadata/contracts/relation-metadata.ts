
import type {
    EntityTarget
} from './entity-metadata';

import type {
    RelationType
} from './relation-type';

import type {
    ReferentialAction
} from './referential-action';

import type {
    JoinColumnMetadata
} from './join-column-metadata';

import type {
    JoinTableMetadata
} from './join-table-metadata';

/**
 * Permite resolver la entidad destino
 * de manera diferida.
 */
export type RelationTargetFactory<
    T extends object = object
> = () => EntityTarget<T>;

/**
 * Selecciona una propiedad de la entidad destino.
 *
 * Ejemplo:
 * user => user.orders
 */
export type InverseRelationSelector<
    T extends object
> = (entity: T) => unknown;

export interface RelationOptions {
    readonly nullable?: boolean;

    readonly onDelete?: ReferentialAction;
    readonly onUpdate?: ReferentialAction;
}

/**
 * Metadatos normalizados de una relación.
 *
 * El destino se conserva como una función
 * para resolverlo posteriormente.
 */
export interface RelationMetadata<
    T extends object = object
> {
    readonly propertyKey: string | symbol;

    readonly type: RelationType;

    readonly target: RelationTargetFactory<T>;

    /**
     * Propiedad inversa, si existe.
     *
     * Ejemplo: orders en User.
     */
    readonly inversePropertyKey?: string | symbol;

    /**
     * Indica si esta relación administra
     * la clave foránea o la tabla intermedia.
     */
    readonly isOwningSide: boolean;

    readonly nullable: boolean;

    readonly onDelete?: ReferentialAction;
    readonly onUpdate?: ReferentialAction;

    /**
     * Columnas de unión para OneToOne
     * o ManyToOne propietarios.
     */
    readonly joinColumns: readonly JoinColumnMetadata[];

    /**
     * Tabla intermedia para ManyToMany
     * del lado propietario.
     */
    readonly joinTable?: JoinTableMetadata;
}
