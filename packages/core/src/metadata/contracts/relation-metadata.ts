
import type { EntityTarget } from './entity-metadata';

export type RelationType =
    | 'one-to-one'
    | 'one-to-many'
    | 'many-to-one'
    | 'many-to-many';

export type ReferentialAction =
    | 'CASCADE'
    | 'RESTRICT'
    | 'SET NULL'
    | 'NO ACTION'
    | 'SET DEFAULT';

export interface JoinColumnMetadata {
    readonly name: string;
    readonly referencedColumnName: string;
}

export interface JoinTableMetadata {
    readonly name: string;
    readonly schema?: string;
    readonly joinColumn: JoinColumnMetadata;
    readonly inverseJoinColumn: JoinColumnMetadata;
}

export interface RelationMetadata {
    readonly propertyKey: string | symbol;
    readonly type: RelationType;

    /**
     * Se resuelve cuando todas las entidades
     * ya están registradas.
     */
    readonly target: () => EntityTarget;

    readonly inversePropertyKey?: string | symbol;

    readonly nullable: boolean;

    readonly onDelete?: ReferentialAction;
    readonly onUpdate?: ReferentialAction;

    readonly joinColumn?: JoinColumnMetadata;
    readonly joinTable?: JoinTableMetadata;
}
