
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    QueryAstError,
    column,
    param,
    literal,
    nullExpression,
    eq,
    ne,
    gt,
    gte,
    lt,
    lte,
    like,
    notLike,
    and,
    or,
    not,
    isNull,
    isNotNull,
    inList,
    notInList,
    between,
    notBetween
} from '../src/query';

describe('Query AST builders', () => {
    describe('Expressions', () => {
        it('should create an immutable column', () => {
            const expression = column('u', 'name');

            expect(expression).toEqual({
                kind: 'column',
                alias: 'u',
                property: 'name'
            });

            expect(Object.isFrozen(expression))
                .toBe(true);
        });

        it('should reject invalid column identifiers', () => {
            expect(() => column('', 'name'))
                .toThrow(QueryAstError);

            expect(() => column('u', ''))
                .toThrow(QueryAstError);

            expect(() => column('u; DROP TABLE users', 'name'))
                .toThrow(QueryAstError);
        });

        it('should create a named parameter', () => {
            const expression = param('status');

            expect(expression.name).toBe('status');
            expect(Object.isFrozen(expression)).toBe(true);
        });

        it('should reject invalid parameter names', () => {
            expect(() => param(''))
                .toThrow(QueryAstError);

            expect(() => param('user.status'))
                .toThrow(QueryAstError);
        });

        it('should create a literal expression', () => {
            const expression = literal(42);

            expect(expression.value).toBe(42);
            expect(Object.isFrozen(expression)).toBe(true);
        });

        it('should reject unsupported literal values', () => {
            expect(() => literal(Number.NaN))
                .toThrow(QueryAstError);

            expect(() => literal(Infinity))
                .toThrow(QueryAstError);
        });

        it('should copy mutable literal values', () => {
            const date = new Date('2026-01-01T00:00:00Z');
            const bytes = new Uint8Array([1, 2, 3]);

            const dateExpression = literal(date);
            const bytesExpression = literal(bytes);

            date.setUTCFullYear(2030);
            bytes[0] = 99;

            expect(
                (dateExpression.value as Date).getUTCFullYear()
            ).toBe(2026);

            expect(
                (bytesExpression.value as Uint8Array)[0]
            ).toBe(1);
        });

        it('should create a null expression', () => {
            const expression = nullExpression();

            expect(expression.kind).toBe('null');
            expect(Object.isFrozen(expression)).toBe(true);
        });
    });

    describe('Comparisons', () => {
        it('should create equality predicates', () => {
            const predicate = eq(
                column('u', 'status'),
                param('status')
            );

            expect(predicate.kind).toBe('comparison');
            expect(predicate.operator).toBe('eq');
            expect(Object.isFrozen(predicate)).toBe(true);
        });

        it('should support all comparison operators', () => {
            const left = column('u', 'age');
            const right = param('age');

            expect(ne(left, right).operator).toBe('ne');
            expect(gt(left, right).operator).toBe('gt');
            expect(gte(left, right).operator).toBe('gte');
            expect(lt(left, right).operator).toBe('lt');
            expect(lte(left, right).operator).toBe('lte');
            expect(like(left, right).operator).toBe('like');
            expect(notLike(left, right).operator)
                .toBe('not-like');
        });

        it('should reject NULL equality comparisons', () => {
            expect(() =>
                eq(column('u', 'name'), nullExpression())
            ).toThrow(QueryAstError);

            expect(() =>
                ne(column('u', 'name'), literal(null))
            ).toThrow(QueryAstError);
        });
    });

    describe('Logical predicates', () => {
        it('should create nested AND/OR predicates', () => {
            const predicate = and(
                eq(column('u', 'active'), param('active')),
                or(
                    gte(column('u', 'age'), param('age')),
                    isNull(column('u', 'deletedAt'))
                )
            );

            expect(predicate.operator).toBe('and');
            expect(predicate.predicates).toHaveLength(2);
            expect(predicate.predicates[1]?.kind)
                .toBe('logical');

            expect(Object.isFrozen(predicate)).toBe(true);
            expect(Object.isFrozen(predicate.predicates))
                .toBe(true);
        });

        it('should reject logical predicates with fewer than two operands', () => {
            const predicate = isNull(column('u', 'name'));

            expect(() => and(predicate))
                .toThrow(QueryAstError);

            expect(() => or())
                .toThrow(QueryAstError);
        });

        it('should create NOT predicates', () => {
            const predicate = not(
                eq(column('u', 'active'), param('active'))
            );

            expect(predicate.kind).toBe('not');
            expect(Object.isFrozen(predicate)).toBe(true);
        });
    });

    describe('Special predicates', () => {
        it('should create IS NULL and IS NOT NULL', () => {
            const expression = column('u', 'deletedAt');

            expect(isNull(expression).negated).toBe(false);
            expect(isNotNull(expression).negated).toBe(true);
        });

        it('should create immutable IN predicates', () => {
            const values = [
                param('first'),
                param('second')
            ];

            const predicate = inList(
                column('u', 'status'),
                values
            );

            expect(predicate.values).toHaveLength(2);
            expect(Object.isFrozen(predicate.values))
                .toBe(true);

            values.push(param('third'));

            expect(predicate.values).toHaveLength(2);
        });

        it('should reject empty IN lists', () => {
            expect(() =>
                inList(column('u', 'id'), [])
            ).toThrow(QueryAstError);
        });

        it('should create NOT IN predicates', () => {
            const predicate = notInList(
                column('u', 'status'),
                [param('status')]
            );

            expect(predicate.negated).toBe(true);
        });

        it('should create BETWEEN predicates', () => {
            const expression = column('u', 'age');

            const normal = between(
                expression,
                param('minimum'),
                param('maximum')
            );

            const negated = notBetween(
                expression,
                param('minimum'),
                param('maximum')
            );

            expect(normal.negated).toBe(false);
            expect(negated.negated).toBe(true);
        });
    });
});
