import {
    ensureSymbolMetadata
} from '../../src/runtime';

const metadataSymbol = ensureSymbolMetadata();

if (Symbol.metadata !== metadataSymbol) {
    throw new Error(
        'TyORM failed to initialize Symbol.metadata.'
    );
}
