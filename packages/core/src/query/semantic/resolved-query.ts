import type {
    SelectQuery,
    QueryJoin
} from '../ast';

import type {
    OrmEntityMetadata
} from '../../metadata';

import type {
    ResolvedJoinCondition
} from './resolved-join-condition';

import type {
    ResolvedJoinPlan
} from './resolved-join-plan';

/**
 * Representa un alias de consulta asociado
 * a los metadatos de una entidad.
 */
export interface ResolvedQueryAlias {
    readonly alias: string;
    readonly metadata: OrmEntityMetadata;
}

/**
 * Representa una referencia a una columna
 * que ya fue resuelta semánticamente.
 */
export interface ResolvedColumnReference {
    readonly kind: 'resolved-column';

    readonly sourceAlias: string;
    readonly property: string;

    readonly columnName: string;
    readonly tableAlias: string;
}

/**
 * Representa un JOIN lógico resuelto.
 *
 * Puede ser:
 * - Directo: ManyToOne, OneToOne, OneToMany.
 * - Mediante tabla intermedia: ManyToMany.
 */
export interface ResolvedJoin {
    readonly kind: 'resolved-join';

    readonly join: QueryJoin;

    readonly source: ResolvedQueryAlias;
    readonly target: ResolvedQueryAlias;

    readonly relationProperty: string | symbol;

    /**
     * Condiciones de JOIN directo.
     *
     * Se conserva por compatibilidad
     * con las fases anteriores.
     *
     * Para ManyToMany será un arreglo vacío.
     */
    readonly conditions:
    readonly ResolvedJoinCondition[];

    /**
     * Plan semántico del JOIN.
     *
     * - direct: unión directa.
     * - junction: unión mediante tabla intermedia.
     */
    readonly plan: ResolvedJoinPlan;
}

/**
 * Representación semántica de una consulta SELECT.
 */
export interface ResolvedSelectQuery {
    readonly kind: 'resolved-select';

    readonly query: SelectQuery;

    readonly aliases: ReadonlyMap<
        string,
        ResolvedQueryAlias
    >;

    readonly columns:
    readonly ResolvedColumnReference[];

    readonly joins:
    readonly ResolvedJoin[];
}
