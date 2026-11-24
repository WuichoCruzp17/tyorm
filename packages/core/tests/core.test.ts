
import { describe, expect, it } from 'vitest';

import * as core from '../src/index';

describe('TyORM Core', () => {

    it('should expose the current version', () => {
        expect(core.TYORM_VERSION).toBe('0.1.0');
    });

    it('does not expose internal implementation helpers from the package root', () => {
        for (const name of [
            'helloTyORM',
            'ensureSymbolMetadata',
            'getRelationDeclarations',
            'ManagedTransactionContext',
            'TransactionContextState',
            'RelationMetadataResolver',
            'OrmMetadataValidator',
            'JoinConditionResolver',
            'JunctionJoinResolver',
            'QueryAstNormalizer',
            'QueryAstValidator',
            'resolveMutation'
        ]) {
            expect(core).not.toHaveProperty(name);
        }
    });

});
