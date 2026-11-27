export type BatchScalarDataType =
    | "integer"
    | "string"
    | "boolean"
    | "float"
    | "date"
    | "json"
    | "vector"
    | (string & {});

export interface BatchEntityColumnSchema {
    readonly propertyName: string;
    readonly columnName: string;
    readonly dataType: BatchScalarDataType;
    readonly nullable: boolean;
    readonly isPrimaryKey: boolean;
    readonly isGenerated: boolean;
    readonly updatable: boolean;
}

export interface BatchEntitySchema {
    readonly entityName: string;
    readonly tableName: string;
    readonly columns: readonly BatchEntityColumnSchema[];
    readonly primaryKeys: readonly string[];
}
