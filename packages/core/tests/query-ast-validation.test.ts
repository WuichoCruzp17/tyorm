
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
    count,
    param,
    eq,
    and,
    or,
    isNull
} from '../src/query';



function createQuery() {
    class User { }

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

describe('GROUP BY', () => {
    const validator = new QueryAstValidator();
    const normalizer = new QueryAstNormalizer();

    it.each([
        [{}, 'GROUP BY must be an array.'],
        [[param('key')], 'GROUP BY requires column expressions.'],
        [[column('missing', 'id')], 'Unknown column alias: missing.']
    ])('rejects invalid grouping %j', (groupBy, message) => {
        expect(() => validator.validate({ ...createQuery(), groupBy }))
            .toThrow(message);
    });

    it('copies and freezes grouping columns', () => {
        const expression = column('u', 'id');
        const groupBy = [expression];
        const normalized = normalizer.normalize({ ...createQuery(), groupBy });
        groupBy.pop();

        expect(normalized.groupBy).toEqual([expression]);
        expect(Object.isFrozen(normalized.groupBy)).toBe(true);
        expect(normalized.groupBy?.[0]).not.toBe(expression);
        expect(Object.isFrozen(normalized.groupBy?.[0])).toBe(true);
    });
});

describe('aggregate expressions', () => {
    const validator = new QueryAstValidator();
    const normalizer = new QueryAstNormalizer();

    it('accepts and snapshots aggregate columns in global HAVING', () => {
        const argument = column('u', 'id');
        const expression = count(argument);
        const normalized = normalizer.normalize({
            ...createQuery(),
            selections: [{ expression }],
            having: eq(count(), param('size'))
        });

        const selection = normalized.selections[0]?.expression;
        expect(selection).toEqual(expression);
        expect(selection).not.toBe(expression);
        if (selection?.kind !== 'aggregate') {
            throw new Error('Expected a normalized aggregate.');
        }
        expect(selection.argument).not.toBe(argument);
        expect(Object.isFrozen(selection.argument)).toBe(true);
    });

    it.each([
        { kind: 'aggregate', function: 'unknown' },
        { kind: 'aggregate', function: 'sum' },
        { kind: 'aggregate', function: 'max', argument: count() }
    ])('rejects invalid aggregate %j', expression => {
        expect(() => validator.validateExpression(expression)).toThrow(QueryAstError);
    });

    it('rejects references to undeclared aliases in aggregate arguments', () => {
        expect(() => validator.validate({
            ...createQuery(),
            selections: [{ expression: count(column('unknown', 'id')) }]
        })).toThrow('Unknown column alias: unknown.');
    });

    it('rejects aggregates in WHERE and JOIN ON', () => {
        const predicate = eq(count(), param('size'));
        const query = createQuery();

        expect(() => validator.validate({ ...query, where: predicate }))
            .toThrow('Aggregates are not allowed in WHERE.');

        expect(() => validator.validate({
            ...query,
            joins: [{
                kind: 'join',
                type: 'inner',
                sourceAlias: 'u',
                relation: 'roles',
                alias: 'r',
                on: predicate
            }]
        })).toThrow('Aggregates are not allowed in JOIN ON.');
    });
});

describe('HAVING', () => {
    const validator = new QueryAstValidator();
    const normalizer = new QueryAstNormalizer();

    it.each([{ ...createQuery() }, { ...createQuery(), groupBy: [] }])(
        'requires grouping columns',
        query => {
            const having = eq(column('u', 'id'), param('id'));

            expect(() => validator.validate({ ...query, having }))
                .toThrow('HAVING requires grouping columns or an aggregate.');
        }
    );

    it('validates aliases in the predicate', () => {
        expect(() => validator.validate({
            ...createQuery(),
            groupBy: [column('u', 'id')],
            having: eq(column('missing', 'id'), param('id'))
        })).toThrow('Unknown column alias: missing.');
    });

    it('copies and freezes the predicate', () => {
        const having = eq(column('u', 'id'), param('id'));
        const normalized = normalizer.normalize({
            ...createQuery(),
            groupBy: [column('u', 'id')],
            having
        });

        expect(normalized.having).toEqual(having);
        expect(normalized.having).not.toBe(having);
        expect(Object.isFrozen(normalized.having)).toBe(true);
    });
});

describe('QueryAstValidator - ORDER BY', () => {

    class User { }

    const validator = new QueryAstValidator();

    function createQuery(
        orderBy: unknown
    ) {
        return {
            kind: 'select',
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
            where: undefined,
            orderBy,
            distinct: false
        };
    }

    it.each([
        'asc',
        'desc'
    ])(
        'accepts ORDER BY direction %s',
        direction => {

            const query = createQuery([
                {
                    expression: column('u', 'id'),
                    direction
                }
            ]);

            expect(() =>
                validator.validate(query)
            ).not.toThrow();
        }
    );

    it.each([
        'ASC',
        'DESC',
        'invalid',
        '',
        null,
        undefined,
        123,
        true
    ])(
        'rejects invalid ORDER BY direction %s',
        direction => {

            const query = createQuery([
                {
                    expression: column('u', 'id'),
                    direction
                }
            ]);

            expect(() =>
                validator.validate(query)
            ).toThrow(
                'Invalid ORDER BY direction.'
            );
        }
    );

    it.each([
        null,
        {},
        'id',
        123
    ])(
        'rejects ORDER BY when it is not an array',
        orderBy => {

            expect(() =>
                validator.validate(
                    createQuery(orderBy)
                )
            ).toThrow(
                'ORDER BY must be an array.'
            );
        }
    );

    it('rejects invalid ORDER BY expressions', () => {

        const query = createQuery([
            {
                expression: {
                    kind: 'unknown'
                },
                direction: 'asc'
            }
        ]);

        expect(() =>
            validator.validate(query)
        ).toThrow(QueryAstError);
    });

    it('rejects unknown ORDER BY aliases', () => {

        const query = createQuery([
            {
                expression: column('unknown', 'id'),
                direction: 'asc'
            }
        ]);

        expect(() =>
            validator.validate(query)
        ).toThrow(
            'Unknown column alias: unknown.'
        );
    });

});
