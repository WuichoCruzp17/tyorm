
import type {
    InverseRelationReference,
    RelationOptions,
    RelationTargetFactory
} from '../../metadata/contracts';

import {
    createRelationDecorator
} from './relation-decorator-factory';

export function OneToOne<T extends object>(
    target: RelationTargetFactory<T>,
    inverse?: InverseRelationReference<T>,
    options: RelationOptions = {}
) {
    return createRelationDecorator(
        'one-to-one',
        target,
        inverse,
        options
    );
}
