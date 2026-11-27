import type { EntityTarget } from "../../metadata/contracts/entity-metadata.js";
import type { OrmMetadataModel } from "../../metadata/orm-metadata-model.js";
import type {
    BatchEntityColumnSchema,
    BatchEntitySchema,
} from "../contracts/batch-entity-schema.contract.js";

function toSchemaPropertyKey(propertyKey: string | symbol): string {
    return typeof propertyKey === "symbol"
        ? (propertyKey.description ?? propertyKey.toString())
        : propertyKey;
}

export class BatchEntitySchemaMapper {
    constructor(private readonly metadataModel: OrmMetadataModel) { }

    mapEntity<T extends object>(entityTarget: EntityTarget<T>): BatchEntitySchema {
        const ormEntity = this.metadataModel.getEntity(entityTarget);
        const { entity } = ormEntity;

        const pkSchemas: BatchEntityColumnSchema[] = entity.primaryKeys.map((pk) => {
            const propertyName = toSchemaPropertyKey(pk.propertyKey);

            return {
                propertyName,
                columnName: pk.columnName,
                dataType: pk.type,
                nullable: pk.nullable,
                isPrimaryKey: true,
                isGenerated: pk.generation !== "none",
                updatable: pk.updatable,
            };
        });

        const regularColumnSchemas: BatchEntityColumnSchema[] = entity.columns.map((col) => {
            const propertyName = toSchemaPropertyKey(col.propertyKey);

            return {
                propertyName,
                columnName: col.columnName,
                dataType: col.type,
                nullable: col.nullable,
                isPrimaryKey: false,
                isGenerated: col.hasDefault,
                updatable: col.updatable,
            };
        });

        const primaryKeys = Object.freeze(
            entity.primaryKeys.map((pk) => toSchemaPropertyKey(pk.propertyKey)),
        );

        return Object.freeze({
            entityName: entity.target.name,
            tableName: entity.tableName,
            ...(entity.schema !== undefined ? { schema: entity.schema } : {}),
            columns: Object.freeze([...pkSchemas, ...regularColumnSchemas]),
            primaryKeys,
        });
    }
}
