
import type {
    SelectQuery,
    QueryJoin
} from '../ast';

import type {
    OrmEntityMetadata
} from '../../metadata';

export interface ResolvedQueryAlias {
    readonly alias: string;
    readonly metadata: OrmEntityMetadata;
}

export interface ResolvedColumnReference {
    readonly kind: 'resolved-column';
    readonly sourceAlias: string;
    readonly property: string;
    readonly columnName: string;
    readonly tableAlias: string;
}

export interface ResolvedJoin {
    readonly kind: 'resolved-join';
    readonly join: QueryJoin;
    readonly source: ResolvedQueryAlias;
    readonly target: ResolvedQueryAlias;
    readonly relationProperty: string | symbol;
}

export interface ResolvedSelectQuery {
    readonly kind: 'resolved-select';
    readonly query: SelectQuery;
    readonly aliases: ReadonlyMap<
        string,
        ResolvedQueryAlias
    >;
    readonly columns: readonly ResolvedColumnReference[];
    readonly joins: readonly ResolvedJoin[];
}
