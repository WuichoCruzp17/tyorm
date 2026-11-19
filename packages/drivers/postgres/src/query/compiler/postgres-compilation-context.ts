
import type { SqlDialect } from '@tyorm/core';

import { PostgresSqlDialect } from './postgres-sql-dialect';

export class PostgresCompilationContext {

    private readonly values: unknown[] = [];

    constructor(
        private readonly parameters:
            Readonly<Record<string, unknown>> = {},
        private readonly dialect: SqlDialect =
            new PostgresSqlDialect()
    ) { }


    bind(name: string): string {
        if (!Object.hasOwn(this.parameters, name)) {
            throw new Error(
                `Missing query parameter "${name}".`
            );
        }

        const value = this.parameters[name];

        if (value === undefined) {
            throw new Error(
                `Query parameter "${name}" cannot be undefined.`
            );
        }

        const position = this.values.length + 1;
        const placeholder = this.dialect.parameter(position);

        this.values.push(value);

        return placeholder;
    }


    getParameters(): readonly unknown[] {
        return Object.freeze([...this.values]);
    }
}
