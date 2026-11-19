
import { describe, expect, it } from 'vitest';

import type {
    ResolvedSelectQuery
} from '@tyorm/core';

import {
    PostgresExpressionCompiler
} from '../src/query/compiler/postgres-expression-compiler';

import {
    PostgresCompilationContext
} from '../src/query/compiler/postgres-compilation-context';

describe('PostgresExpressionCompiler', () => {

    const compiler = new PostgresExpressionCompiler();


    const resolved = {
        columns: [
            {
                kind: 'resolved-column',
                sourceAlias: 'u',
                property: 'firstName',
                columnName: 'first_name',
                tableAlias: 'u'
            },
            {
                kind: 'resolved-column',
                sourceAlias: 'u',
                property: 'id',
                columnName: 'user_id',
                tableAlias: 'u'
            }
        ]
    } satisfies Pick<ResolvedSelectQuery, 'columns'>;


    it('compiles resolved columns', () => {
        const context = new PostgresCompilationContext();

        const sql = compiler.compile(
            {
                kind: 'column',
                alias: 'u',
                property: 'firstName'
            },
            resolved,
            context
        );

        expect(sql).toBe('"u"."first_name"');
        expect(context.getParameters()).toEqual([]);
    });

    it('compiles named parameters', () => {
        const context = new PostgresCompilationContext({
            name: 'Luis'
        });

        const sql = compiler.compile(
            {
                kind: 'parameter',
                name: 'name'
            },
            resolved,
            context
        );

        expect(sql).toBe('$1');
        expect(context.getParameters()).toEqual(['Luis']);
    });

    it('compiles null expressions', () => {
        const context = new PostgresCompilationContext();

        const sql = compiler.compile(
            { kind: 'null' },
            resolved,
            context
        );

        expect(sql).toBe('NULL');
    });

    it('rejects unresolved columns', () => {
        const context = new PostgresCompilationContext();

        expect(() => compiler.compile(
            {
                kind: 'column',
                alias: 'u',
                property: 'unknown'
            },
            resolved,
            context
        )).toThrow('Unresolved column "u.unknown".');
    });

    it('rejects missing parameters', () => {
        const context = new PostgresCompilationContext();

        expect(() => compiler.compile(
            {
                kind: 'parameter',
                name: 'missing'
            },
            resolved,
            context
        )).toThrow('Missing query parameter "missing".');
    });

    it('rejects undefined parameters', () => {
        const context = new PostgresCompilationContext({
            name: undefined
        });

        expect(() => compiler.compile(
            {
                kind: 'parameter',
                name: 'name'
            },
            resolved,
            context
        )).toThrow(
            'Query parameter "name" cannot be undefined.'
        );
    });


    it('compiles string literals as parameters', () => {
        const context = new PostgresCompilationContext();

        const sql = compiler.compile(
            {
                kind: 'literal',
                value: 'ACTIVE'
            },
            resolved,
            context
        );

        expect(sql).toBe('$1');
        expect(context.getParameters()).toEqual(['ACTIVE']);
    });

    it('compiles numeric literals as parameters', () => {
        const context = new PostgresCompilationContext();

        const sql = compiler.compile(
            {
                kind: 'literal',
                value: 25
            },
            resolved,
            context
        );

        expect(sql).toBe('$1');
        expect(context.getParameters()).toEqual([25]);
    });

    it('compiles boolean literals as parameters', () => {
        const context = new PostgresCompilationContext();

        const sql = compiler.compile(
            {
                kind: 'literal',
                value: false
            },
            resolved,
            context
        );

        expect(sql).toBe('$1');
        expect(context.getParameters()).toEqual([false]);
    });

    it('compiles null literals as parameters', () => {
        const context = new PostgresCompilationContext();

        const sql = compiler.compile(
            {
                kind: 'literal',
                value: null
            },
            resolved,
            context
        );

        expect(sql).toBe('$1');
        expect(context.getParameters()).toEqual([null]);
    });

});
