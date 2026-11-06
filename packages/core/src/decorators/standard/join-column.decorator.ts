
import type {
    JoinColumnOptions
} from '../../metadata/contracts';

import {
    appendDeclaration,
    JOIN_COLUMNS
} from './decorator-storage';

import {
    getRelationDecoratorContext
} from './relation-decorator-helper';

export function JoinColumn(
    options: JoinColumnOptions | readonly JoinColumnOptions[] = {}
) {
    return function (
        _value: undefined,
        context: ClassFieldDecoratorContext
    ): void {
        const metadata = getRelationDecoratorContext(
            '@JoinColumn',
            context
        );

        const columns = Array.isArray(options)
            ? options
            : [options];

        appendDeclaration(metadata, JOIN_COLUMNS, {
            propertyKey: context.name,
            columns: columns.map(column => ({ ...column }))
        });
    };
}
