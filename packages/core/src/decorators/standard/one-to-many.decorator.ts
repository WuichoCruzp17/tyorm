
import type {
    InverseRelationReference,
    RelationOptions,
    RelationTargetFactory
} from '../../metadata/contracts';

import {
    createRelationDecorator
} from './relation-decorator-factory';

export function OneToMany<T extends object>(
    target: RelationTargetFactory<T>,
    inverse?: InverseRelationReference<T>,
    options: RelationOptions = {}
) {
    return createRelationDecorator(
        'one-to-many',
        target,
        inverse,
        options
    );
}
