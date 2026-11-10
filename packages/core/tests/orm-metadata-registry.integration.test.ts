
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    getEntityMetadata,
    ensureSymbolMetadata
} from '../src/decorators';

import {
    MetadataRegistry,
    OrmMetadataModel
} from '../src/metadata';

ensureSymbolMetadata();

describe('OrmMetadataModel + MetadataRegistry', () => {

    it('should build ORM model from registry', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const registry = new MetadataRegistry();

        registry.register(getEntityMetadata(User));

        const model = OrmMetadataModel.fromRegistry(registry);

        expect(model.hasEntity(User)).toBe(true);
        expect(model.getEntity(User).entity.target).toBe(User);
    });

    it('should resolve relations between registered entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const registry = new MetadataRegistry();

        registry.register(getEntityMetadata(User));
        registry.register(getEntityMetadata(Order));

        const model = OrmMetadataModel.fromRegistry(registry);

        const relation = model.getEntity(Order).relations[0];

        expect(relation?.type).toBe('many-to-one');
        expect(relation?.joinColumns[0]?.name).toBe('user_id');
        expect(relation?.joinColumns[0]?.referencedColumnName)
            .toBe('id');
    });

    it('should reject relations targeting unregistered entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            user!: User;
        }

        const registry = new MetadataRegistry();

        registry.register(getEntityMetadata(Order));

        expect(() => OrmMetadataModel.fromRegistry(registry))
            .toThrow(/not registered for resolution/);
    });

    it('should keep a stable model when registry changes', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity()
        class Product {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const registry = new MetadataRegistry();

        registry.register(getEntityMetadata(User));

        const model = OrmMetadataModel.fromRegistry(registry);

        registry.register(getEntityMetadata(Product));

        expect(model.hasEntity(User)).toBe(true);
        expect(model.hasEntity(Product)).toBe(false);

        const updatedModel = OrmMetadataModel.fromRegistry(registry);

        expect(updatedModel.hasEntity(Product)).toBe(true);
    });

    it('should reuse immutable registry metadata snapshots', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const registry = new MetadataRegistry();

        registry.register(getEntityMetadata(User));

        const model = OrmMetadataModel.fromRegistry(registry);

        const registered = registry.get(User);
        const consolidated = model.getEntity(User);

        expect(consolidated.entity).not.toBe(registered);

        expect(consolidated.entity).toStrictEqual(registered);
        expect(Object.isFrozen(consolidated.entity)).toBe(true);
        expect(Object.isFrozen(consolidated.entity.primaryKeys))
            .toBe(true);
        expect(Object.isFrozen(consolidated.relations)).toBe(true);
    });
});
