import type {
    ResolvedSelectQuery
} from '../semantic/resolved-query';

import type {
    CompiledQuery
} from './compiled-query';

export interface SqlCompiler {

    compile(
        query: ResolvedSelectQuery,
        parameters?: Readonly<Record<string, unknown>>
    ): CompiledQuery;
}
