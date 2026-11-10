
export class QueryAstError extends Error {
    constructor(message: string) {
        super(message);

        this.name = 'QueryAstError';

        Object.setPrototypeOf(
            this,
            new.target.prototype
        );
    }
}
