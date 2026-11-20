# AGENTS.md — TyORM

> Instrucciones para agentes de desarrollo (Codex) que trabajen en el repositorio TyORM.
> Estado documentado: 20 de noviembre de 2026. Este archivo recoge decisiones y resultados comunicados durante el desarrollo; **el repositorio y sus pruebas son la fuente de verdad**. Verificar siempre los archivos reales antes de editar.

## 1. Misión y alcance

TyORM es un ORM en TypeScript inspirado en JPA (Java), diseñado para ser multibase de datos. Debe ofrecer API basada en decoradores y consultas, resolución de relaciones, transacciones robustas y consultas/proyecciones hacia DTO explícitos y proyecciones automáticas (similar a records/DTO en Java). Evitar acoplar el núcleo semántico a PostgreSQL.

**Objetivos acordados:**
- Soporte multibase de datos a través de drivers y dialectos (PostgreSQL es el primer driver implementado).
- API de decoradores modernos TC39 Stage 3 primero; compatibilidad con decoradores legacy en una fase posterior.
- API de consultas y decoradores, ambas.
- Relaciones `ManyToOne`, `OneToMany`, `OneToOne`, `ManyToMany`.
- DTO explícitos y proyecciones automáticas disponibles. La API de consultas tipo records permite reutilizar esquemas de proyección.
- Cambios incrementales, con pruebas y typecheck por cada fase.

## 2. Entorno y organización

- Monorepo **pnpm**, nombre `tyorm`, versiones conocidas `@tyorm/core@0.1.0` y `@tyorm/postgres@0.1.0`.
- Entorno habitual: Windows, PowerShell, VS Code; raíz local del usuario: `C:\Proyectos\Tyorm\tyorm`.
- TypeScript, Node.js, Vitest 3.2.7, PostgreSQL para integración.
- Paquetes conocidos: `packages/core` y `packages/drivers/postgres` (`@tyorm/postgres`).
- Configuración conocida de `core`: `target: ES2022`, `lib: [ES2022, ESNext.Decorators]`, `experimentalDecorators: false`, `emitDecoratorMetadata: false`; verificar el `tsconfig` actual antes de asumir que permanece igual.
- No crear archivos o rutas por conjetura: buscar la ubicación real y seguir los índices de exportación existentes.

## 3. Reglas obligatorias para Codex

1. **Inspeccionar antes de modificar.** Leer interfaces, contratos, exportaciones, fixtures y pruebas relacionadas. No inventar nombres de propiedades, helpers, decoradores ni rutas.
2. **No romper contratos públicos** ni cambiar arquitectura por conveniencia de una prueba. Proponer migraciones explícitas si son inevitables.
3. **Separar responsabilidades:** `core` valida/normaliza/resuelve consultas y relaciones; cada driver compila SQL y maneja conexiones según su dialecto.
4. **Trabajar por bloques pequeños.** Explicar archivos afectados, motivo, riesgos y pruebas. Preferir diffs mínimos.
5. **Preservar errores originales** en transacciones y respetar los estados de conexión/contexto. No introducir dobles `COMMIT`, `ROLLBACK` indebidos ni rechazos asíncronos sin gestionar.
6. **No concatenar valores de usuario en SQL.** Usar parámetros vinculados (`$1`, `$2`, etc.) y el dialecto para citar identificadores.
7. **No suponer convenciones de claves foráneas.** Obtener columnas físicas desde metadatos resueltos (`joinColumns` / `ResolvedJoinCondition`).
8. **No debilitar validaciones para pasar pruebas.** Corregir fixtures incompletos en vez de permitir relaciones o columnas inexistentes.
9. **No declarar una fase terminada sin ejecutar y registrar sus pruebas.** Distinguir lo implementado, lo observado en pruebas y lo pendiente.
10. **No ejecutar operaciones destructivas** (borrar tablas, migraciones irreversibles, reset de BD, eliminar archivos) sin autorización explícita.
11. **Evitar cambios ajenos a la tarea.** No reescribir todo el compilador, los decoradores o los resolvers si basta un cambio local.
12. **Comunicación en español**, con código TypeScript claro, explicación de decisiones y comandos reproducibles.
13. **Pruebas unitarias por archivo nuevo de implementación.** Añadir un archivo de pruebas unitarias correspondiente a cada archivo de implementación nuevo.

## 4. Arquitectura conocida

### 4.1 Core y metadatos

- Entidades y propiedades mediante decoradores modernos (`@Entity`, `@Column`, `@PrimaryKey`, decoradores de relaciones).
- `getEntityMetadata(Entity)` y `OrmMetadataModel` construyen/registran metadatos consultables por el resolver.
- Metadatos de entidad, columnas, claves primarias y relaciones, incluidos lados propietario/inverso, columnas de unión y, para ManyToMany, tabla intermedia.
- Verificar cómo se construyen `RelationMetadata.isOwningSide`, `RelationMetadata.joinColumns` e `inversePropertyKey` antes de escribir fixtures.

### 4.2 Transacciones

Componentes desarrollados: `TransactionManager`, `TransactionContext` y contexto administrado; seguimiento de operaciones pendientes, errores de consultas, rollback y release. Estados conocidos del gestor: `NOT_STARTED`, `ACTIVE`, `COMMIT_ATTEMPTED`. `TransactionError` conserva `originalError` y, cuando corresponde, errores de rollback/release. La conexión PostgreSQL contempla estado transaccional, liberación, conexión dañada y resultados inciertos de transacción.

**No asumir que operaciones `Promise.all` sobre una conexión PostgreSQL se ejecutan realmente en paralelo.** Mantener pruebas para consultas encoladas y errores SQL dentro de transacciones.

### 4.3 Pipeline de consultas

```text
QueryAst
  -> QueryAstValidator
  -> QueryAstNormalizer
  -> QuerySemanticResolver (OrmMetadataModel)
  -> ResolvedSelectQuery / ResolvedJoinPlan
  -> PostgresSelectCompiler
  -> CompiledQuery { sql, parameters }
```

- `QueryAstValidator` verifica forma de AST, expresiones, predicados, aliases y paginación.
- `QueryAstNormalizer` normaliza y congela nodos de consulta.
- `QuerySemanticResolver` valida entidades/relaciones/propiedades, resuelve alias y columnas físicas, y genera planes JOIN.
- `JoinConditionResolver` genera condiciones de JOIN directos; `JunctionJoinResolver` resuelve ManyToMany; `JunctionAliasGenerator` evita colisiones de alias internos.
- `PostgresSelectCompiler` utiliza `PostgresSqlDialect`, `PostgresCompilationContext`, `PostgresExpressionCompiler` y `PostgresPredicateCompiler`.

## 5. Contratos observados (verificar en el repositorio)

### 5.1 SELECT resuelto

```ts
interface ResolvedQueryAlias {
  readonly alias: string;
  readonly metadata: OrmEntityMetadata;
}
interface ResolvedColumnReference {
  readonly kind: 'resolved-column';
  readonly sourceAlias: string;
  readonly property: string;
  readonly columnName: string;
  readonly tableAlias: string;
}
interface ResolvedJoin {
  readonly kind: 'resolved-join';
  readonly join: QueryJoin;
  readonly source: ResolvedQueryAlias;
  readonly target: ResolvedQueryAlias;
  readonly relationProperty: string | symbol;
  readonly conditions: readonly ResolvedJoinCondition[];
  readonly plan: ResolvedJoinPlan;
}
interface ResolvedSelectQuery {
  readonly kind: 'resolved-select';
  readonly query: SelectQuery;
  readonly aliases: ReadonlyMap<string, ResolvedQueryAlias>;
  readonly columns: readonly ResolvedColumnReference[];
  readonly joins: readonly ResolvedJoin[];
}
```

### 5.2 JOIN resuelto

```ts
interface ResolvedJoinColumn {
  readonly tableAlias: string;
  readonly columnName: string;
}
interface ResolvedJoinCondition {
  readonly kind: 'resolved-join-condition';
  readonly left: ResolvedJoinColumn;
  readonly right: ResolvedJoinColumn;
}
interface ResolvedDirectJoin {
  readonly kind: 'direct';
  readonly conditions: readonly ResolvedJoinCondition[];
}
interface ResolvedJunctionTable {
  readonly name: string;
  readonly schema?: string;
  readonly alias: string;
}
interface ResolvedJunctionJoin {
  readonly kind: 'junction';
  readonly table: ResolvedJunctionTable;
  readonly sourceConditions: readonly ResolvedJoinCondition[];
  readonly targetConditions: readonly ResolvedJoinCondition[];
}
type ResolvedJoinPlan = ResolvedDirectJoin | ResolvedJunctionJoin;
```

`JoinConditionResolver.resolve()`:
- Rechaza ManyToMany directo.
- Si `relation.isOwningSide`, usa `relation.joinColumns`: izquierda `sourceAlias.column.name`, derecha `targetAlias.column.referencedColumnName`.
- Si es lado inverso, busca `relation.inversePropertyKey` en las relaciones de la entidad destino, exige lado propietario y usa columnas invertidas.
- Rechaza relaciones sin columnas de unión.

### 5.3 Decorador ManyToOne

```ts
export interface RelationOptions {
  readonly nullable?: boolean;
  readonly onDelete?: ReferentialAction;
  readonly onUpdate?: ReferentialAction;
}
export function ManyToOne<T extends object>(
  target: RelationTargetFactory<T>,
  inverse?: InverseRelationReference<T>,
  options: RelationOptions = {}
) {
  return createRelationDecorator('many-to-one', target, inverse, options);
}
```

`createRelationDecorator` es un decorador de campo moderno (`ClassFieldDecoratorContext`), registra la declaración mediante `appendDeclaration(metadata, RELATIONS, { propertyKey: context.name, type, target, inverse?, options })`. **No recibe columnas físicas en `RelationOptions`**. Investigar dónde se configuran/generan `joinColumns` antes de asumir nombres por convención.

## 6. Funcionalidad completada / estado observado

### 6.1 Core y PostgreSQL

- Núcleo transaccional y driver PostgreSQL desarrollados y probados en iteraciones anteriores.
- Hubo ejecuciones exitosas de pruebas de `TransactionManager`, `TransactionContext`, `PostgreSQLConnection`, driver de integración, clasificador de errores y transacciones de integración. **Volver a correr suites actuales; los conteos históricos no certifican el estado de la rama presente.**
- Decoradores modernos y contratos de metadatos desarrollados en fases previas; comprobar cobertura y exportaciones actuales.
- Existen resolvers de relaciones directas e intermedias. PostgreSQL compila planes de JOIN directo.

### 6.2 Fase 5.2.2: SELECT PostgreSQL

- SELECT de una/múltiples columnas, DISTINCT, FROM y cita de identificadores: pruebas previamente aprobadas.
- WHERE: comparaciones, `IS NULL`, predicados anidados y parámetros: pruebas aprobadas.
- ORDER BY ASC/DESC y múltiples expresiones: pruebas aprobadas.
- **5.2.2.5 LIMIT/OFFSET: completada y probada.** Usa `context.bindValue` y preserva orden de parámetros con WHERE. `QueryAstValidator` acepta enteros seguros no negativos (`Number.isSafeInteger`), incluidos 0, y rechaza negativos, fraccionarios, NaN, Infinity, strings y enteros fuera de rango.
- La suite `tests/query-ast-validator.pagination.test.ts` (core) terminó con **13 pruebas correctas** después de corregir el fixture para construir el nodo AST de columna directamente (no importar un `column()` inexistente desde `../src/query/ast`).
## 7. Fase 5.2.2.6.1 — INNER JOIN directo completado

El compilador emite los JOIN directos después de FROM a partir de `resolved.joins` y `join.plan.conditions`. Cita los identificadores con el dialecto, combina las condiciones físicas con AND y agrega `join.on` al mismo ON. El contexto compartido vincula los valores de ON antes que los de WHERE y paginación. En esta fase todavía se rechazaban los planes con tabla intermedia.

En el fixture, la propiedad `department` apunta a una entidad con PK física `department_id`. Sin configuración explícita, el resolver infiere `department_department_id` como columna local. Para obtener `department_id` en ambos lados se declara `@JoinColumn({ name: 'department_id', referencedColumnName: 'department_id' })` junto a `@ManyToOne(() => Department)` y se registran ambas entidades en `OrmMetadataModel`.

Se verificaron los metadatos de la relación, el plan directo, el SQL completo, la clave compuesta, el esquema, la selección y ordenación por el alias relacionado, la precedencia de OR, el orden de parámetros y el rechazo de planes con tabla intermedia.

Validación del 19 de noviembre de 2026 con el índice compilado de core regenerado. Ambos typecheck pasaron. Core pasó 258 pruebas en 20 archivos. PostgreSQL pasó 104 pruebas en 8 archivos, incluidas las 26 del compilador SELECT. Se excluyeron las suites de integración con una base de datos.

### 7.1 Fase 5.2.2.6.2 — LEFT JOIN directo y relaciones inversas

El pipeline existente compila `LEFT JOIN` en ambos sentidos de una relación bidireccional `ManyToOne` / `OneToMany`. El fixture usa una clave foránea local `department_fk` y una clave primaria referenciada `department_id` para comprobar la orientación de las columnas.

La prueba de integración confirma que un filtro en `ON` conserva los departamentos sin usuarios o sin usuarios que cumplan el filtro. También confirma que un usuario con clave foránea nula sigue apareciendo en el JOIN propietario.

Validación del 19 de noviembre de 2026. Ambos typecheck pasaron. Core pasó 258 pruebas. PostgreSQL pasó 106 pruebas sin base de datos, incluidas las 28 del compilador SELECT. El caso nuevo de integración pasó contra PostgreSQL. Las demás pruebas de integración quedaron fuera de la ejecución.

### 7.2 Fase 5.2.2.6.3 — ManyToMany en PostgreSQL

El compilador usa el plan de Core para emitir dos cláusulas del mismo tipo (`INNER JOIN` o `LEFT JOIN`). La primera une el origen con la tabla intermedia mediante `sourceConditions`. La segunda une la tabla intermedia con el destino mediante `targetConditions` y agrega `join.on` a su `ON`. El dialecto cita los identificadores, incluidos el esquema y el alias interno de la tabla intermedia.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, 258 pruebas de Core y 107 de PostgreSQL sin base de datos, incluidas las 29 del compilador SELECT. Las pruebas nuevas cubren el lado propietario con `INNER JOIN`, el lado inverso con `LEFT JOIN`, clave compuesta, esquema, colisión de alias y orden de parámetros de `ON` y `WHERE`. Las suites de integración con PostgreSQL quedaron fuera de esta ejecución.

### 7.3 Fase 5.2.2.6.4 — Integración de JOIN encadenados

La consulta de integración enlaza `Department.users` (relación inversa directa) y `User.roles` (ManyToMany) en PostgreSQL. Usa tablas temporales en una transacción y comprueba los filtros `ON`, el filtro `WHERE`, el orden de parámetros, `ORDER BY`, LIMIT/OFFSET, la colisión con un alias interno y la unión por clave compuesta. La suite también verifica el rechazo de un alias desconocido y de un parámetro ausente.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, 258 pruebas de Core y 110 pruebas de PostgreSQL, incluidas las tres de `chained-joins.integration.test.ts`. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

### 7.4 Fase 5.2.2.7 — GROUP BY en PostgreSQL

`SelectQuery.groupBy` es opcional y acepta referencias a columnas de la raíz o de alias de JOIN. Core valida los nodos y los alias, copia y congela la lista, y resuelve las propiedades a columnas físicas. PostgreSQL emite la cláusula después de WHERE y antes de ORDER BY. Una lista vacía omite la cláusula. En esta fase todavía estaban pendientes HAVING y las funciones agregadas.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, la comprobación estricta de los archivos de prueba modificados, 262 pruebas de Core y 113 de PostgreSQL. La integración con tablas temporales comprobó que varias filas de una relación ManyToMany se agrupan en una. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

### 7.5 Fase 5.2.2.8 — HAVING en PostgreSQL

`SelectQuery.having` reutiliza los predicados de consulta y requiere un GROUP BY con al menos una columna. Core valida los alias, normaliza el predicado y resuelve sus referencias a columnas. PostgreSQL emite HAVING después de GROUP BY y vincula sus parámetros después de WHERE y antes de ORDER BY y la paginación. Las funciones agregadas se incorporaron en la fase 5.2.2.9.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, la comprobación estricta de los archivos de prueba modificados, 266 pruebas de Core y 115 de PostgreSQL. La integración con tablas temporales verificó que HAVING conserva o descarta el grupo según el parámetro. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

### 7.6 Fase 5.2.2.9 — Funciones agregadas en PostgreSQL

Core expone `count()`, `count(columna)`, `sum(columna)`, `avg(columna)`, `min(columna)` y `max(columna)`. Las expresiones agregadas se admiten en SELECT, HAVING y ORDER BY. HAVING puede operar sobre un grupo global cuando la consulta contiene un agregado. Los agregados sobre columnas usan los nombres físicos resueltos y las proyecciones agregadas admiten un alias. PostgreSQL determina la compatibilidad de tipos y las reglas de agrupación.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, la comprobación estricta de los archivos de prueba modificados, 272 pruebas de Core y 116 de PostgreSQL. La integración con tablas temporales comprobó COUNT y SUM sobre una relación ManyToMany y el filtrado por el conteo. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

### 7.7 Proyecciones a DTO explícitos

`executeDtoQuery` recibe un ejecutor, un resolvedor, un compilador SQL, una consulta y una proyección. La proyección define un mapa de alias a expresiones y un mapper que construye el DTO. TypeScript infiere los alias y el tipo de retorno del mapper. Los valores de fila se exponen como `unknown` para que el mapper aplique las conversiones y validaciones del DTO. Un alias ausente produce un error y un valor nulo se conserva. PostgreSQL respeta los alias explícitos de columnas y agregados.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, la comprobación estricta de las pruebas modificadas, 272 pruebas de Core y 117 de PostgreSQL. La integración construyó una instancia del DTO a partir de una columna con alias y un COUNT de PostgreSQL convertido de string a bigint por el mapper. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

### 7.8 Proyecciones automáticas

`executeProjectionQuery` recibe un mapa de alias a expresiones y devuelve un objeto por fila con las claves inferidas de ese mapa. Reutiliza la ejecución y validación de alias de `executeDtoQuery`. Cada propiedad conserva el valor del driver, incluidos los valores nulos, y tiene tipo `unknown`.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, la comprobación estricta de las pruebas modificadas, 282 pruebas de Core y 117 de PostgreSQL. La integración verificó una proyección automática con una columna y un agregado. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

### 7.9 Consultas estilo record

`defineRecord` declara un esquema reutilizable de campos con una función de validación o conversión por campo. `executeRecordQuery` vincula cada campo a una expresión para la consulta concreta y reutiliza la ejecución de proyecciones. El resultado es un objeto congelado por fila, con los tipos inferidos de las funciones del esquema. La consulta rechaza selecciones adicionales o ausentes antes de compilar.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, la comprobación estricta de las pruebas modificadas, 285 pruebas de Core y 117 de PostgreSQL. La integración comprobó la conversión de COUNT a bigint y las pruebas unitarias reutilizaron un esquema con dos selecciones diferentes. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

## 8. Hoja de ruta siguiente

1. **5.2.2.6.1:** completada y validada según la sección 7.
2. **5.2.2.6.2:** completada y validada según la sección 7.1.
3. **5.2.2.6.3:** completada y validada según la sección 7.2.
4. **5.2.2.6.4:** completada y validada según la sección 7.3.
5. **5.2.2.7:** GROUP BY completado y validado según la sección 7.4. HAVING quedó completado en la **fase 5.2.2.8** según la sección 7.5. Las funciones agregadas quedaron completadas en la **fase 5.2.2.9** según la sección 7.6.
6. DTO explícitos completados y validados según la sección 7.7. Proyecciones automáticas validadas según la sección 7.8. API de consultas tipo records validada según la sección 7.9.
7. Compatibilidad de decoradores legacy después de estabilizar la API moderna.
8. Ampliación multibase de datos mediante dialectos/drivers independientes; priorizar interfaces estables.
9. Mantener/regresar a pruebas de integración PostgreSQL, especialmente comportamiento tras errores SQL y consultas pendientes en una transacción.

## 9. Comandos de validación

Ejecutar desde la raíz del monorepo, confirmando que los scripts existen:

```powershell
pnpm --filter @tyorm/core typecheck
pnpm --filter @tyorm/core exec vitest run --mode test tests/query-ast-validator.pagination.test.ts
pnpm --filter @tyorm/core test
pnpm --filter @tyorm/postgres typecheck
pnpm --filter @tyorm/postgres exec vitest run --mode test tests/postgres-select-compiler.test.ts
pnpm --filter @tyorm/postgres test
pnpm -r --if-present typecheck
pnpm -r --if-present build
pnpm -r --if-present test
```

Las pruebas de integración PostgreSQL pueden requerir `.env.test` y un servidor accesible. No exponer credenciales ni registrar secretos. Verificar scripts de Vitest y configuración de variables antes de diagnosticar pruebas omitidas.

## 10. Forma de trabajo esperada con Codex

Al recibir una tarea:
1. Identificar fase y criterio de aceptación.
2. Leer código real y pruebas existentes; mostrar hallazgos y posibles discrepancias con este documento.
3. Proponer un cambio mínimo y enumerar archivos afectados.
4. Implementar sin introducir API hipotéticas.
5. Ejecutar `typecheck` y pruebas focalizadas, después regresión por paquete cuando sea viable.
6. Reportar resultados exactos (aprobadas, fallidas, omitidas), causas y pendientes.
7. Actualizar este `AGENTS.md` cuando se confirme una nueva fase o cambie una decisión arquitectónica.

### Primera instrucción sugerida para Codex

> Lee `AGENTS.md` y analiza el estado real del monorepo TyORM sin modificar archivos. Enfócate en `PostgresSelectCompiler`, `QuerySemanticResolver`, `JoinConditionResolver`, el ensamblaje de `RelationMetadata.joinColumns` y `tests/postgres-select-compiler.test.ts`. Explica cómo construir un fixture válido `User.department -> Department` con la API existente y cómo cerrar la fase 5.2.2.6.1. Señala cualquier discrepancia entre el documento y el repositorio.
