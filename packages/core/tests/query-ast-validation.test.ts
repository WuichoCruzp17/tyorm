
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    QueryAstError,
    QueryAstValidator,
    QueryAstNormalizer,
    column,
    param,
    eq,
    and,
    or,
    isNull
} from '../src/query';

function createQuery() {
    class User {}

    return {
        kind: 'select' as const,
        from: {
            entity: User,
            alias: 'u'
        },
        selections: [
            {
                expression: column('u', 'id')
            }
        ],
        joins: [],
        orderBy: [],
        distinct: false
    };
}

describe('Query AST validation', () => {
    const validator = new QueryAstValidator();

    it('should accept a valid SELECT query', () => {
        expect(() =>
            validator.validate(createQuery())
        ).not.toThrow();
    });

    it('should reject unknown query kinds', () => {
        expect(() =>
            validator.validate({ kind: 'unknown' })
        ).toThrow(QueryAstError);
    });

    it('should reject duplicate JOIN aliases', () => {
        const query = {
            ...createQuery(),
            joins: [
                {
                    kind: 'join',
                    type: 'inner',
                    sourceAlias: 'u',
                    relation: 'manager',
                    alias: 'm'
                },
                {
                    kind: 'join',
                    type: 'left',
                    sourceAlias: 'u',
                    relation: 'reviewer',
                    alias: 'm'
                }
            ]
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/Duplicate query alias/);
    });

    it('should reject unknown JOIN source aliases', () => {
        const query = {
            ...createQuery(),
            joins: [
                {
                    kind: 'join',
                    type: 'inner',
                    sourceAlias: 'missing',
                    relation: 'manager',
                    alias: 'm'
                }
            ]
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/Unknown JOIN source alias/);
    });

    it('should reject unknown column aliases', () => {
        const query = {
            ...createQuery(),
            where: eq(
                column('missing', 'id'),
                param('id')
            )
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/Unknown column alias/);
    });

    it('should reject negative LIMIT values', () => {
        const query = {
            ...createQuery(),
            limit: -1
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/LIMIT/);
    });

    it('should reject invalid ORDER BY directions', () => {
        const query = {
            ...createQuery(),
            orderBy: [
                {
                    expression: column('u', 'name'),
                    direction: 'sideways'
                }
            ]
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/ORDER BY direction/);
    });

    it('should reject invalid logical predicates', () => {
        const query = {
            ...createQuery(),
            where: {
                kind: 'logical',
                operator: 'and',
                predicates: []
            }
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/at least two operands/);
    });

    it('should reject circular predicates', () => {
        const circular: {
            kind: string;
            predicate?: unknown;
        } = {
            kind: 'not'
        };

        circular.predicate = circular;

        const query = {
            ...createQuery(),
            where: circular
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/Circular AST reference/);
    });

    it('should reject invalid NULL comparisons', () => {
        const query = {
            ...createQuery(),
            where: {
                kind: 'comparison',
                operator: 'eq',
                left: column('u', 'name'),
                right: {
                    kind: 'null'
                }
            }
        };

        expect(() =>
            validator.validate(query)
        ).toThrow(/IS NULL/);
    });
});

describe('Query AST normalization', () => {
    const normalizer = new QueryAstNormalizer();

    it('should return an immutable snapshot', () => {
        const source = createQuery();

        const normalized = normalizer.normalize(source);

        expect(normalized).not.toBe(source);
        expect(Object.isFrozen(normalized)).toBe(true);
        expect(Object.isFrozen(normalized.from)).toBe(true);
        expect(Object.isFrozen(normalized.selections))
            .toBe(true);
    });

    it('should not be affected by source mutations', () => {
        const source = createQuery();
        const normalized = normalizer.normalize(source);

        source.selections.push({
            expression: column('u', 'name')
        });

        expect(normalized.selections).toHaveLength(1);
    });

    it('should flatten nested AND predicates', () => {
        const source = {
            ...createQuery(),
            where: and(
                eq(column('u', 'active'), param('active')),
                and(
                    eq(column('u', 'status'), param('status')),
                    isNull(column('u', 'deletedAt'))
                )
            )
        };

        const normalized = normalizer.normalize(source);

        expect(normalized.where?.kind).toBe('logical');

        if (normalized.where?.kind !== 'logical') {
            throw new Error('Expected logical predicate.');
        }

        expect(normalized.where.operator).toBe('and');
        expect(normalized.where.predicates).toHaveLength(3);
    });

    it('should preserve different logical operators', () => {
        const source = {
            ...createQuery(),
            where: and(
                eq(column('u', 'active'), param('active')),
                or(
                    eq(column('u', 'role'), param('role')),
                    isNull(column('u', 'deletedAt'))
                )
            )
        };

        const normalized = normalizer.normalize(source);

        if (normalized.where?.kind !== 'logical') {
            throw new Error('Expected logical predicate.');
        }

        expect(normalized.where.predicates).toHaveLength(2);
        expect(normalized.where.predicates[1]?.kind)
            .toBe('logical');
    });

    it('should reject invalid input before normalization', () => {
        expect(() =>
            normalizer.normalize({
                kind: 'select',
                from: null
            })
        ).toThrow(QueryAstError);
    });
});
