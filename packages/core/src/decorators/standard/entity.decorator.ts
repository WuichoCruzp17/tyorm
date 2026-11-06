
import type {
    EntityOptions
} from '../../metadata/contracts';

import {
    ENTITY_OPTIONS
} from './decorator-storage';
import { requireDecoratorMetadata } from './metadata-context';

export function Entity(
    options: EntityOptions = {}
) {
    return function (
        _target: Function,
        context: ClassDecoratorContext
    ): void {
        if (context.kind !== 'class') {
            throw new Error(
                '@Entity can only decorate classes.'
            );
        }

        const metadata = requireDecoratorMetadata(context.metadata);

        metadata[ENTITY_OPTIONS] = { ...options };
    };
}
