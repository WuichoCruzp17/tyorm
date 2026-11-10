
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    Entity,
    PrimaryKey,
    ManyToOne,
    JoinColumn,
    getEntityMetadata,
    ensureSymbolMetadata
} from '../src/decorators';

import {
    MetadataError,
    OrmMetadataModel
} from '../src/metadata';

ensureSymbolMetadata();

describe('OrmMetadataModel', () => {
    it('should consolidate entities and relations', () => {
        @Entity({ name: 'users' })
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        @Entity({ name: 'orders' })
        class Order {
            @PrimaryKey({ type: 'uuid' })
            id!: string;

            @ManyToOne(() => User)
            @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id'
            })
            user!: User;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User),
            getEntityMetadata(Order)
        ]);

        const metadata = model.getEntity(Order);

        expect(metadata.entity.target).toBe(Order);
        expect(metadata.relations).toHaveLength(1);
        expect(metadata.relations[0]?.type)
            .toBe('many-to-one');
        expect(metadata.relations[0]?.joinColumns[0]?.name)
            .toBe('user_id');
    });

    it('should report registered entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        expect(model.hasEntity(User)).toBe(true);
        expect(model.getEntities()).toHaveLength(1);
    });

    it('should reject unknown entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        class Unknown { }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        expect(() => model.getEntity(Unknown))
            .toThrow(MetadataError);
    });

    it('should reject duplicate entities', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const metadata = getEntityMetadata(User);

        expect(() => new OrmMetadataModel([
    metadata,
    metadata
])).toThrow(/Duplicate entity:/);
    });

    it('should expose immutable ORM metadata', () => {
        @Entity()
        class User {
            @PrimaryKey({ type: 'uuid' })
            id!: string;
        }

        const model = new OrmMetadataModel([
            getEntityMetadata(User)
        ]);

        const metadata = model.getEntity(User);
        const entities = model.getEntities();

        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(entities)).toBe(true);
        expect(Object.isFrozen(metadata.relations))
            .toBe(true);
    });
});
