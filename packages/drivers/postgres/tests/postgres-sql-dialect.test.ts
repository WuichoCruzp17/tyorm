
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    PostgresSqlDialect
} from '../src/query/compiler/postgres-sql-dialect';

describe('PostgresSqlDialect', () => {

    const dialect = new PostgresSqlDialect();

    it('should quote SQL identifiers', () => {
        expect(
            dialect.quoteIdentifier('users')
        ).toBe('"users"');
    });

    it('should escape double quotes', () => {
        expect(
            dialect.quoteIdentifier('user"name')
        ).toBe('"user""name"');
    });

    it('should generate positional parameters', () => {
        expect(dialect.parameter(1)).toBe('$1');
        expect(dialect.parameter(2)).toBe('$2');
        expect(dialect.parameter(10)).toBe('$10');
    });

    it('should reject invalid parameter indexes', () => {
        expect(() => dialect.parameter(0))
            .toThrow(RangeError);

        expect(() => dialect.parameter(-1))
            .toThrow(RangeError);

        expect(() => dialect.parameter(1.5))
            .toThrow(RangeError);

        expect(() => dialect.parameter(NaN))
            .toThrow(RangeError);

        expect(() => dialect.parameter(Infinity))
            .toThrow(RangeError);
    });

    it('should preserve valid identifier characters', () => {
        expect(
            dialect.quoteIdentifier('first_name')
        ).toBe('"first_name"');

        expect(
            dialect.quoteIdentifier('UserTable')
        ).toBe('"UserTable"');
    });

    it('should quote schema and table separately', () => {
        const schema = dialect.quoteIdentifier('public');
        const table = dialect.quoteIdentifier('users');

        expect(`${schema}.${table}`)
            .toBe('"public"."users"');
    });

});
