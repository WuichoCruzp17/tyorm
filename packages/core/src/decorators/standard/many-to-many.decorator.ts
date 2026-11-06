
import type {
    InverseRelationReference,
    RelationOptions,
    RelationTargetFactory
} from '../../metadata/contracts';

import {
    createRelationDecorator
} from './relation-decorator-factory';

export function ManyToMany<T extends object>(
    target: RelationTargetFactory<T>,
    inverse?: InverseRelationReference<T>,
    options: RelationOptions = {}
) {
    return createRelationDecorator(
        'many-to-many',
        target,
        inverse,
        options
    );
}
