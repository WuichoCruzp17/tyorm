
import { describe, expect, it } from 'vitest';

import {
    TYORM_VERSION,
    helloTyORM
} from '../src/index';

describe('TyORM Core', () => {

    it('should expose the current version', () => {
        expect(TYORM_VERSION).toBe('0.1.0');
    });

    it('should initialize correctly', () => {
        expect(helloTyORM()).toBe('TyORM is ready!');
    });

});
