import { expect, it } from 'vitest';
import { initializeSymbolMetadata } from '../src/runtime';

it('initializes decorator metadata before tests and reuses the same symbol', () => {
    expect(typeof Symbol.metadata).toBe('symbol');
    expect(initializeSymbolMetadata()).toBe(Symbol.metadata);
});
