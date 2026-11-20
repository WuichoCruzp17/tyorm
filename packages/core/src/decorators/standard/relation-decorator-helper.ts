
import { MetadataError } from '../../metadata/metadata-error';

import { requireDecoratorMetadata } from './metadata-context';

import type { FieldDeclarationContext } from './legacy-decorator-adapter';

export function getRelationDecoratorContext(
    decoratorName: string,
    context: FieldDeclarationContext
): DecoratorMetadataObject {
    if (context.static || context.private) {
        throw new MetadataError(
            `${decoratorName} can only decorate public instance fields.`
        );
    }

    return requireDecoratorMetadata(context.metadata);
}
