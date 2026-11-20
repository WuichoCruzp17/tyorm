import { MetadataError } from '../../metadata/metadata-error';
import { ensureSymbolMetadata } from '../../runtime';

export type FieldDeclarationContext = Pick<
    ClassFieldDecoratorContext,
    'name' | 'static' | 'private'
> & { readonly metadata: DecoratorMetadataObject | undefined };

export function getLegacyDecoratorMetadata(target: Function): DecoratorMetadataObject {
    const key = ensureSymbolMetadata();
    const existing = Object.getOwnPropertyDescriptor(target, key);
    if (existing?.value !== undefined) {
        return existing.value as DecoratorMetadataObject;
    }

    const metadata: DecoratorMetadataObject = Object.create(null);
    Object.defineProperty(target, key, { value: metadata, configurable: true });
    return metadata;
}

export function compatibleFieldDecorator(
    register: (context: FieldDeclarationContext) => void
) {
    return (
        target: object | undefined,
        context: ClassFieldDecoratorContext | string | symbol,
        descriptor?: PropertyDescriptor
    ): void => {
        if (typeof context === 'object') {
            register(context);
            return;
        }

        if (descriptor !== undefined || target === undefined) {
            throw new MetadataError('Legacy field decorators require an instance property.');
        }

        if (typeof target === 'function') {
            register({ name: context, static: true, private: false, metadata: undefined });
            return;
        }

        const constructor = Object.getOwnPropertyDescriptor(target, 'constructor')?.value;
        if (typeof constructor !== 'function' || constructor.prototype !== target) {
            throw new MetadataError('Legacy field decorators require a class prototype.');
        }

        register({
            name: context,
            static: false,
            private: false,
            metadata: getLegacyDecoratorMetadata(constructor)
        });
    };
}
