
/**
 * Inicializa Symbol.metadata cuando el runtime
 * todavía no ofrece soporte nativo.
 *
 * Debe ejecutarse antes de evaluar clases
 * que utilizan decoradores TC39.
 */
export function initializeSymbolMetadata(): symbol {
    const symbolConstructor = Symbol as SymbolConstructor & {
        metadata?: symbol;
    };

    if (symbolConstructor.metadata !== undefined) {
        return symbolConstructor.metadata;
    }

    const metadataSymbol = Symbol('Symbol.metadata');

    Object.defineProperty(Symbol, 'metadata', {
        value: metadataSymbol,
        writable: false,
        enumerable: false,
        configurable: false
    });

    return metadataSymbol;
}
