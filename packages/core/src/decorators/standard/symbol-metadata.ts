
export function ensureSymbolMetadata(): void {
    if (Symbol.metadata === undefined) {
        Object.defineProperty(Symbol, 'metadata', {
            value: Symbol('Symbol.metadata'),
            writable: false,
            enumerable: false,
            configurable: false
        });
    }
}
