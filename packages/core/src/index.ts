export * from './drivers';
export const TYORM_VERSION = '0.1.0';

export { TransactionError, TransactionManager } from './transactions';

export type {
    ColumnType,
    ColumnOptions,
    ColumnMetadata,
    PrimaryKeyOptions,
    PrimaryKeyMetadata,
    PrimaryKeyGenerationStrategy,
    EntityTarget,
    EntityOptions,
    EntityMetadata,
    RelationType,
    ReferentialAction,
    JoinColumnOptions,
    JoinColumnMetadata,
    JoinTableOptions,
    JoinTableMetadata,
    RelationTargetFactory,
    InverseRelationSelector,
    RelationOptions,
    RelationMetadata
} from './metadata';
export type { OrmEntityMetadata } from './metadata/orm-entity-metadata';
export { MetadataError, MetadataRegistry, OrmMetadataModel } from './metadata';

export {
    Column,
    PrimaryKey,
    Entity,
    getEntityMetadata,
    ManyToOne,
    OneToMany,
    OneToOne,
    ManyToMany,
    JoinColumn,
    JoinTable
} from './decorators';

export * from './query/ast';
export * from './query/builders';
export { QueryAstError } from './query/errors';
export { QuerySemanticError } from './query/semantic/query-semantic-error';
export { QuerySemanticResolver } from './query/semantic/query-semantic-resolver';
export type {
    ResolvedQueryAlias,
    ResolvedColumnReference,
    ResolvedJoin,
    ResolvedSelectQuery
} from './query/semantic/resolved-query';
export type {
    ResolvedJoinColumn,
    ResolvedJoinCondition
} from './query/semantic/resolved-join-condition';
export type {
    ResolvedDirectJoin,
    ResolvedJunctionJoin,
    ResolvedJunctionTable,
    ResolvedJoinPlan
} from './query/semantic/resolved-join-plan';
export type {
    CompiledQuery,
    SqlDialect,
    FunctionCall,
    ProcedureCall,
    SqlCompiler
} from './query/compiler';
export type {
    MutationQuery,
    ResolvedMutation
} from './query/mutation';
export {
    executeDtoQuery,
    executeProjectionQuery
} from './query/execute-dto-query';
export {
    defineRecord,
    executeRecordQuery
} from './query/execute-record-query';
export type { QueryRecord } from './query/execute-record-query';

export * from './data-source';
export * from './repository';
export { Repository as ReadRepository } from './repository';
export { RepositoryDecorator } from './repository-decorator';
