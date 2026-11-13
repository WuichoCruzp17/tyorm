import { QuerySemanticError } from './query-semantic-error';

export class JunctionAliasGenerator {
    private nextIndex = 0;

    constructor(
        private readonly reservedAliases: Set<string>
    ) { }

    generate(): string {
        let alias: string;

        do {
            alias = `__tyorm_junction_${this.nextIndex++}`;
        } while (this.reservedAliases.has(alias));

        this.reservedAliases.add(alias);

        return alias;
    }

    reserve(alias: string): void {
        if (this.reservedAliases.has(alias)) {
            throw new QuerySemanticError(
                `Duplicate query alias "${alias}".`
            );
        }

        this.reservedAliases.add(alias);
    }
}
