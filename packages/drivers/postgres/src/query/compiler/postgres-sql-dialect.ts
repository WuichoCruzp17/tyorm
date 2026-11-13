
import type {
    SqlDialect
} from '@tyorm/core';

export class PostgresSqlDialect implements SqlDialect {

    quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    parameter(index: number): string {
        if (
            !Number.isSafeInteger(index) ||
            index < 1
        ) {
            throw new RangeError(
                'PostgreSQL parameter index must be a positive integer.'
            );
        }

        return `$${index}`;
    }
}
