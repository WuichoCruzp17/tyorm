
import { MetadataError } from '../../metadata/metadata-error';

export function requireDecoratorMetadata(
    metadata: DecoratorMetadataObject | undefined
): DecoratorMetadataObject {
    if (metadata === undefined) {
        throw new MetadataError(
            'Decorator metadata is unavailable. ' +
            'Call ensureSymbolMetadata() before loading decorated classes.'
        );
    }

    return metadata;
}
