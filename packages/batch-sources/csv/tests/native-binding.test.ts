import { describe, expect, it } from 'vitest';

import {
    helloBatchCsv,
    batchCsvVersion
} from '../index.js';

describe('TyORM Batch CSV Native Binding', () => {

    it('should load the native Rust module', () => {
        expect(helloBatchCsv).toBeTypeOf('function');
    });

    it('should execute a Rust function', () => {
        expect(helloBatchCsv()).toBe(
            'TyORM Batch CSV Engine'
        );
    });

    it('should return the engine version', () => {
        expect(batchCsvVersion()).toBe('0.1.0');
    });

});
