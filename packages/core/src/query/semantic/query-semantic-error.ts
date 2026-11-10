
import { QueryAstError } from '../errors';

export class QuerySemanticError extends QueryAstError {
    constructor(message: string) {
        super(message);

        this.name = 'QuerySemanticError';

        Object.setPrototypeOf(
            this,
            new.target.prototype
        );
    }
}
