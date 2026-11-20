
import type {
    PrimaryKeyOptions
} from '../../metadata/contracts';

import {
    appendDeclaration,
    PRIMARY_KEYS
} from './decorator-storage';
import { requireDecoratorMetadata } from './metadata-context';

import { compatibleFieldDecorator } from './legacy-decorator-adapter';

export function PrimaryKey(
    options: PrimaryKeyOptions
) {
    return compatibleFieldDecorator(context => {
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
    });
}
