
import type {
    PrimaryKeyOptions
} from '../../metadata/contracts';

import {
    appendDeclaration,
    PRIMARY_KEYS
} from './decorator-storage';
import { requireDecoratorMetadata } from './metadata-context';

export function PrimaryKey(
    options: PrimaryKeyOptions
) {
    return function (
        _value: undefined,
        context: ClassFieldDecoratorContext
    ): void {
        if (context.static || context.private) {
            throw new Error(
                '@PrimaryKey can only decorate public instance fields.'
            );
        }

        appendDeclaration(
            requireDecoratorMetadata(context.metadata),
            PRIMARY_KEYS,
            {
                propertyKey: context.name,
                options: { ...options }
            }
        );
    };
}
