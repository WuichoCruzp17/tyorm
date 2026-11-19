
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    PostgresCompilationContext
} from '../src/query/compiler/postgres-compilation-context';

describe('PostgresCompilationContext', () => {

    it('binds a single parameter', () => {
        const context = new PostgresCompilationContext({
            name: 'Luis'
        });

        expect(context.bind('name')).toBe('$1');

        expect(context.getParameters()).toEqual([
            'Luis'
        ]);
    });

    it('preserves parameter order', () => {
        const context = new PostgresCompilationContext({
            status: 'ACTIVE',
            age: 25
        });

        expect(context.bind('age')).toBe('$1');
        expect(context.bind('status')).toBe('$2');

        expect(context.getParameters()).toEqual([
            25,
            'ACTIVE'
        ]);
    });

    it('rejects missing parameters', () => {
        const context = new PostgresCompilationContext();

        expect(() => context.bind('missing'))
            .toThrow('Missing query parameter "missing".');
    });

    it('supports null parameters', () => {
        const context = new PostgresCompilationContext({
            deletedAt: null
        });

        expect(context.bind('deletedAt')).toBe('$1');

        expect(context.getParameters()).toEqual([
            null
        ]);
    });

    it('binds repeated names independently', () => {
        const context = new PostgresCompilationContext({
            id: 'abc'
        });

        expect(context.bind('id')).toBe('$1');
        expect(context.bind('id')).toBe('$2');

        expect(context.getParameters()).toEqual([
            'abc',
            'abc'
        ]);
    });

    it('returns an immutable parameter snapshot', () => {
        const context = new PostgresCompilationContext({
            id: 10
        });

        context.bind('id');

        const values = context.getParameters();

        expect(Object.isFrozen(values)).toBe(true);
        expect(values).toEqual([10]);
    });


    it('rejects undefined parameters', () => {
        const context = new PostgresCompilationContext({
            name: undefined
        });

        expect(() => context.bind('name'))
            .toThrow(
                'Query parameter "name" cannot be undefined.'
            );

        expect(context.getParameters()).toEqual([]);
    });

    it('preserves parameter positions after rejection', () => {
        const context = new PostgresCompilationContext({
            invalid: undefined,
            valid: 'Luis'
        });

        expect(() => context.bind('invalid'))
            .toThrow(
                'Query parameter "invalid" cannot be undefined.'
            );

        expect(context.bind('valid')).toBe('$1');

        expect(context.getParameters()).toEqual([
            'Luis'
        ]);
    });

});
