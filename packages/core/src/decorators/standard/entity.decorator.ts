
import type {
    EntityOptions
} from '../../metadata/contracts';

import {
    ENTITY_OPTIONS
} from './decorator-storage';
import { requireDecoratorMetadata } from './metadata-context';

import { getLegacyDecoratorMetadata } from './legacy-decorator-adapter';

export function Entity(
    options: EntityOptions = {}
) {
    return function (
        target: Function,
        context?: ClassDecoratorContext
    ): void {
        if (context !== undefined && context.kind !== 'class') {
            throw new Error(
                '@Entity can only decorate classes.'
            );
        }

        const metadata = context === undefined
            ? getLegacyDecoratorMetadata(target)
            : requireDecoratorMetadata(context.metadata);

        metadata[ENTITY_OPTIONS] = { ...options };
    };
}
