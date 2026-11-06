
import type {
    InverseRelationReference,
    RelationOptions,
    RelationTargetFactory,
    RelationType
} from '../../metadata/contracts';

import {
    appendDeclaration,
    RELATIONS
} from './decorator-storage';

import {
    getRelationDecoratorContext
} from './relation-decorator-helper';


export function createRelationDecorator<
    T extends object
>(
    type: RelationType,
    target: RelationTargetFactory<T>,
    inverse?: InverseRelationReference<T>,
    options: RelationOptions = {}
) {
    return function (
        _value: undefined,
        context: ClassFieldDecoratorContext
    ): void {
        const metadata = getRelationDecoratorContext(
            `@${type}`,
            context
        );

        appendDeclaration(metadata, RELATIONS, {
            propertyKey: context.name,
            type,
            target,
            ...(inverse !== undefined ? { inverse } : {}),
            options: { ...options }
        });
    };
}
