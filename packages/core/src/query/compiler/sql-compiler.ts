import type {
    ResolvedSelectQuery
} from '../semantic/resolved-query';

import type {
    CompiledQuery
} from './compiled-query';

import type { ResolvedMutation } from '../mutation';

import type { QueryValue } from '../ast';

export interface FunctionCall {
    readonly schema?: string;
    readonly name: string;
    readonly args?: readonly QueryValue[];
}

export interface SqlCompiler {
    compileFunction?(call: FunctionCall): CompiledQuery;
    compileMutation?(query: ResolvedMutation): CompiledQuery;

    compile(
        query: ResolvedSelectQuery,
        parameters?: Readonly<Record<string, unknown>>
    ): CompiledQuery;
}
