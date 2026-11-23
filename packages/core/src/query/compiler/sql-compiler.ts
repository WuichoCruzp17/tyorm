import type {
    ResolvedSelectQuery
} from '../semantic/resolved-query';

import type {
    CompiledQuery
} from './compiled-query';

import type { ResolvedMutation } from '../mutation';

export interface SqlCompiler {
    compileMutation?(query: ResolvedMutation): CompiledQuery;

    compile(
        query: ResolvedSelectQuery,
        parameters?: Readonly<Record<string, unknown>>
    ): CompiledQuery;
}
