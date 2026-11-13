/**
 * Initializes Symbol.metadata when the runtime
 * does not provide native support.
 *
 * Must be called before decorated classes are evaluated.
 */
export function ensureSymbolMetadata(): symbol {
    if (Symbol.metadata !== undefined) {
        return Symbol.metadata;
    }

    Object.defineProperty(Symbol, 'metadata', {
        value: Symbol('Symbol.metadata'),
        writable: false,
        enumerable: false,
        configurable: true
    });

    return Symbol.metadata;
}
