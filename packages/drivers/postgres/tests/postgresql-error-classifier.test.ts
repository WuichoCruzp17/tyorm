
import { describe, expect, it } from 'vitest';

import {
    isPostgreSQLConnectionError
} from '../src/errors/postgresql-error-classifier';

describe('PostgreSQL error classifier', () => {

    it('should identify connection exceptions', () => {
        expect(
            isPostgreSQLConnectionError({ code: '08006' })
        ).toBe(true);

        expect(
            isPostgreSQLConnectionError({ code: '08003' })
        ).toBe(true);
    });

    it('should identify transport errors', () => {
        expect(
            isPostgreSQLConnectionError({ code: 'ECONNRESET' })
        ).toBe(true);

        expect(
            isPostgreSQLConnectionError({ code: 'EPIPE' })
        ).toBe(true);
    });

    it('should not classify SQL errors as broken connections', () => {
        expect(
            isPostgreSQLConnectionError({ code: '22012' })
        ).toBe(false);

        expect(
            isPostgreSQLConnectionError({ code: '23505' })
        ).toBe(false);

        expect(
            isPostgreSQLConnectionError({ code: '25P02' })
        ).toBe(false);
    });

    it('should handle unknown errors', () => {
        expect(
            isPostgreSQLConnectionError(new Error('Unknown'))
        ).toBe(false);

        expect(
            isPostgreSQLConnectionError(null)
        ).toBe(false);
    });

});
