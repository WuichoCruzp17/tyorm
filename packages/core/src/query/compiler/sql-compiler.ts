import type {
    ResolvedSelectQuery
} from '../semantic/resolved-query';

import type {
    CompiledQuery
} from './compiled-query';

import type { ResolvedMutation } from '../mutation';

import type { QueryValue } from '../ast';
import type { ColumnType } from '../../metadata';

export interface FunctionCall {
    readonly schema?: string;
    readonly name: string;
    readonly args?: readonly QueryValue[];
}

export interface ProcedureParameterType {
    readonly type: ColumnType;
    readonly length?: number;
    readonly precision?: number;
    readonly scale?: number;
}

export interface ProcedureCall {
    readonly schema?: string;
    readonly name: string;
    readonly args?: readonly (
        | QueryValue
        | { readonly mode: 'out'; readonly type: ProcedureParameterType }
        | { readonly mode: 'inout'; readonly value: QueryValue; readonly type: ProcedureParameterType }
    )[];
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
