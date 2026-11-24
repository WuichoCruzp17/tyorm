
import { MetadataError } from '../../metadata/metadata-error';

export function requireDecoratorMetadata(
    metadata: DecoratorMetadataObject | undefined
): DecoratorMetadataObject {
    if (metadata === undefined) {
        throw new MetadataError(
            'Decorator metadata is unavailable. ' +
            'Import "@tyorm/core/register" before loading decorated classes.'
        );
    }

    return metadata;
}
