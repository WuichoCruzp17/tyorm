
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    QueryAstValidator
} from '../src/query/validation/query-ast-validator';

import {
    QueryAstError
} from '../src/query/errors';

/**
 * Fixture mínimo para validar LIMIT y OFFSET.
 *
 * Se utiliza unknown porque QueryAstValidator
 * debe comprobar datos en tiempo de ejecución,
 * incluso cuando no respetan los tipos TypeScript.
 */
function createQuery(
    pagination: Record<string, unknown> = {}
) {
    class User { }

    return {
        kind: 'select',
        from: {
            entity: User,
            alias: 'u'
        },
        selections: [
            {
                expression: {
                    kind: 'column',
                    alias: 'u',
                    property: 'id'
                }
            }
        ],
        joins: [],
        orderBy: [],
        distinct: false,
        ...pagination
    };
}

describe('QueryAstValidator - Pagination', () => {

    const validator = new QueryAstValidator();

    // ========================================================
    // INVALID LIMIT
    // ========================================================

    it.each([
        {
            description: 'negative LIMIT',
            value: -1
        },
        {
            description: 'decimal LIMIT',
            value: 1.5
        },
        {
            description: 'NaN LIMIT',
            value: NaN
        },
        {
            description: 'Infinity LIMIT',
            value: Infinity
        },
        {
            description: 'string LIMIT',
            value: '10'
        }
    ])(
        'rejects $description',
        ({ value }) => {

            const query = createQuery({
                limit: value
            });

            expect(() =>
                validator.validate(query)
            ).toThrow(
                'LIMIT must be a non-negative safe integer.'
            );
        }
    );

    // ========================================================
    // INVALID OFFSET
    // ========================================================

    it.each([
        {
            description: 'negative OFFSET',
            value: -5
        },
        {
            description: 'unsafe OFFSET',
            value: Number.MAX_SAFE_INTEGER + 1
        }
    ])(
        'rejects $description',
        ({ value }) => {

            const query = createQuery({
                offset: value
            });

            expect(() =>
                validator.validate(query)
            ).toThrow(
                'OFFSET must be a non-negative safe integer.'
            );
        }
    );

    // ========================================================
    // VALID PAGINATION
    // ========================================================

    it('accepts LIMIT 0', () => {

        const query = createQuery({
            limit: 0
        });

        expect(() =>
            validator.validate(query)
        ).not.toThrow();
    });

    it('accepts OFFSET 0', () => {

        const query = createQuery({
            offset: 0
        });

        expect(() =>
            validator.validate(query)
        ).not.toThrow();
    });

    it('accepts LIMIT and OFFSET together', () => {

        const query = createQuery({
            limit: 10,
            offset: 20
        });

        expect(() =>
            validator.validate(query)
        ).not.toThrow();
    });

    it('accepts MAX_SAFE_INTEGER', () => {

        const query = createQuery({
            limit: Number.MAX_SAFE_INTEGER,
            offset: Number.MAX_SAFE_INTEGER
        });

        expect(() =>
            validator.validate(query)
        ).not.toThrow();
    });

    it('accepts SELECT without pagination', () => {

        const query = createQuery();

        expect(() =>
            validator.validate(query)
        ).not.toThrow();
    });

    // ========================================================
    // ERROR TYPE
    // ========================================================

    it('throws QueryAstError for invalid pagination', () => {

        const query = createQuery({
            limit: -1
        });

        expect(() =>
            validator.validate(query)
        ).toThrow(QueryAstError);
    });

});
