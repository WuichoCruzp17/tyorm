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

export interface ProcedureCall {
    readonly schema?: string;
    readonly name: string;
    readonly args?: readonly (QueryValue | { readonly mode: 'out' })[];
}

export interface SqlCompiler {
    compileProcedure?(call: ProcedureCall): CompiledQuery;
    compileFunction?(call: FunctionCall): CompiledQuery;
    compileMutation?(query: ResolvedMutation): CompiledQuery;

    compile(
        query: ResolvedSelectQuery,
        parameters?: Readonly<Record<string, unknown>>
    ): CompiledQuery;
}
