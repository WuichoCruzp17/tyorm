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

### 3.1 Buenas prácticas de TypeScript

Aplica estos principios como criterios de decisión, no como reglas para añadir capas o abstracciones innecesarias:

- **KISS (Keep It Simple, Stupid):** elige la solución más directa que cumpla el contrato. Prefiere flujo de control claro y funciones pequeñas con una responsabilidad entendible. No introduzcas patrones, genéricos o niveles de indirección sin una necesidad comprobable.
- **DRY (Don't Repeat Yourself):** comparte lógica cuando varias partes expresen la misma regla de negocio o puedan divergir al cambiar. No unifiques código que solo se parece superficialmente; una pequeña duplicación local es mejor que una abstracción confusa.
- **YAGNI (You Aren't Gonna Need It):** implementa únicamente los requisitos actuales. Evita opciones, extensiones, compatibilidad futura, configurabilidad y APIs públicas especulativas.
- **Separación de responsabilidades (SoC):** mantén cada módulo enfocado y deja las reglas en la capa que posee el contexto. En TyORM, Core resuelve semántica y metadatos; los drivers manejan conexiones y particularidades del motor. Usa interfaces en los límites entre componentes, no para cada clase concreta.
- **SOLID:**
  - **S — Responsabilidad única:** cada módulo debe tener un propósito coherente y cambios por una razón principal.
  - **O — Abierto/cerrado:** extiende mediante contratos existentes cuando haya un caso real; no diseñes puntos de extensión hipotéticos.
  - **L — Sustitución de Liskov:** las implementaciones deben respetar las precondiciones, resultados y errores del contrato que sustituyen.
  - **I — Segregación de interfaces:** evita contratos que obliguen a implementar operaciones que el consumidor no necesita.
  - **D — Inversión de dependencias:** las capas de alto nivel dependen de contratos estables en sus límites, no de detalles de un driver concreto.
- **Clean Code:** usa nombres que expresen intención, mantén funciones y tipos legibles, evita efectos secundarios ocultos y elimina código muerto introducido por el cambio. Comentarios solo cuando aclaren una decisión o restricción que el código no haga evidente.

#### Reglas de TypeScript

- Deja que el compilador ayude: conserva `strict` y los chequeos existentes; modela estados y variantes con uniones discriminadas y tipos explícitos en los límites públicos.
- No uses `any` para silenciar errores. Si el dato es externo o no está validado, represéntalo como `unknown` y compruébalo antes de usarlo. No afirmes tipos con casts si una validación o un tipo correcto resuelve el problema.
- Maneja explícitamente `null`, `undefined`, errores y resultados vacíos de acuerdo con el contrato; no los sustituyas por valores por defecto que oculten fallos.
- Prefiere `readonly` para datos que no deban mutar y evita mutaciones compartidas no necesarias. No congeles o clones datos por rutina si el contrato no lo requiere.
- Mantén las APIs públicas pequeñas y coherentes con las exportaciones actuales. Usa los tipos de dominio existentes antes de crear tipos paralelos o conversiones duplicadas.
- Evita funciones de muchas responsabilidades, booleanos cuyo significado no sea claro, números o strings mágicos y dependencias cíclicas. Extrae una constante o helper cuando haga más clara una regla real.
- No añadas comentarios que repitan el código, ni reformatees o renombres código ajeno al cambio.

Antes de terminar, comprueba: ¿la solución es la mínima que satisface el requisito?, ¿cada abstracción elimina una duplicación o acoplamiento real?, ¿los tipos expresan los estados válidos?, ¿los errores siguen siendo visibles?, ¿las pruebas verifican el comportamiento y no detalles internos?

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

### 7.10 Compatibilidad con decoradores legacy

Los decoradores públicos de entidad, campos y relaciones aceptan tanto la convención Stage 3 como la de TypeScript con `experimentalDecorators: true`. El adaptador legacy crea metadatos propios por clase y reutiliza los contratos y resolvers existentes. Los tipos de columna siguen declarándose en las opciones y la compatibilidad funciona con `emitDecoratorMetadata: false`.

Validación del 20 de noviembre de 2026. Pasaron ambos typecheck, el typecheck de pruebas de Core, 291 pruebas de Core y 117 de PostgreSQL. La suite nueva ejecutó código legacy emitido por TypeScript, resolvió las cuatro relaciones y comprobó la herencia mixta y el rechazo de miembros estáticos y métodos. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

## 8. Hoja de ruta siguiente

1. **5.2.2.6.1:** completada y validada según la sección 7.
2. **5.2.2.6.2:** completada y validada según la sección 7.1.
3. **5.2.2.6.3:** completada y validada según la sección 7.2.
4. **5.2.2.6.4:** completada y validada según la sección 7.3.
5. **5.2.2.7:** GROUP BY completado y validado según la sección 7.4. HAVING quedó completado en la **fase 5.2.2.8** según la sección 7.5. Las funciones agregadas quedaron completadas en la **fase 5.2.2.9** según la sección 7.6.
6. DTO explícitos completados y validados según la sección 7.7. Proyecciones automáticas validadas según la sección 7.8. API de consultas tipo records validada según la sección 7.9.
7. Compatibilidad de decoradores legacy completada y validada según la sección 7.10.
8. **Fase 8.1:** arranque, repositorios de lectura, repositorios transaccionales y escritura con save completados.
9. **Segundo motor:** proveedor SQLite de lectura y escritura implementado. El contrato común de DataSource está verificado en SQLite y PostgreSQL.
10. Mantener/regresar a pruebas de integración PostgreSQL, especialmente comportamiento tras errores SQL y consultas pendientes en una transacción.

### 8.1 Próxima fase — DataSource y repositorios

**Objetivo.** Acercar la API de aplicación a `JpaRepository` de Spring Data JPA mediante repositorios tipados por entidad. Las entidades, filtros y repositorios se consumen desde Core. El motor se elige en la configuración de arranque y se instala como dependencia de la aplicación. Referencia de comportamiento: [Spring Data JPA — JpaRepository](https://docs.spring.io/spring-data/jpa/reference/api/java/org/springframework/data/jpa/repository/JpaRepository.html).

**Punto de partida.** `DriverConfig.type` identifica el motor, pero hoy la aplicación instancia `PostgreSQLDriver` y `PostgresSelectCompiler` por separado. `DatabaseDriver` gestiona conexiones y `SqlCompiler` solo acepta `ResolvedSelectQuery`. El pipeline actual resuelve metadatos, claves y relaciones. Las proyecciones devuelven filas, DTO o records mediante APIs específicas. Falta una capa que coordine el arranque, la ejecución y el mapeo de filas a entidades.

| Entrega | Cambios previstos |
| --- | --- |
| **A. Arranque y selección del motor** | Añadir `DataSource` en Core para registrar entidades, construir el modelo y el resolver, inicializar el driver y gestionar su cierre. Definir un contrato de proveedor que entregue driver y compilador compatibles. PostgreSQL implementará ese proveedor. Seleccionar por `type` mediante un mapa explícito de proveedores o cargadores autorizados y admitir un proveedor inyectado para pruebas o extensiones. |
| **B. Repositorios de lectura** | Exponer desde Core un repositorio por entidad registrada mediante `getRepository(Entity)`. Implementar `findById`, `findAll`, `existsById` y `count` sobre el AST de SELECT, el resolver y el compilador actuales. Crear selecciones a partir de metadatos y mapear columnas escalares con alias controlados. Mantener disponibles las API actuales de consultas y proyecciones. |
| **C. Repositorios en transacciones** | Exponer un alcance transaccional que entregue repositorios vinculados a la conexión de esa transacción. Reutilizar `TransactionManager` y su contexto administrado. Las llamadas del alcance deben usar el mismo ejecutor, incluso si el repositorio se solicita varias veces. |
| **D. Escritura y semántica de save** | Diseñar AST y compilación de INSERT, UPDATE y DELETE con parámetros, claves y valores generados. Validar las reglas de escritura de los metadatos. Definir después cuándo `save` inserta o actualiza, qué devuelve, cómo identifica una entidad nueva y qué garantías ofrece ante concurrencia. |

**Distribución de drivers.** La instalación se resuelve con npm o pnpm. El arranque carga únicamente el proveedor seleccionado entre los paquetes instalados y devuelve un error claro si el motor no está soportado o falta su paquete. Core conserva sus contratos independientes de PostgreSQL. Validar la resolución del paquete con una aplicación externa al workspace antes de cerrar la entrega A.

**Decisiones de contrato para la primera implementación.**

- Proponer `null` para `findById` sin coincidencias y una lista vacía para `findAll` sin resultados. Para claves compuestas, usar un objeto por nombre de propiedad y validar cada componente antes de ejecutar. Revisar cómo expresar los tipos de clave en TypeScript: los decoradores registran metadatos en ejecución y la clase por sí sola no distingue qué campos son claves.
- Definir la materialización por separado de los DTO. `EntityTarget` admite constructores abstractos o con argumentos, así que la estrategia debe establecer qué instancias puede crear el repositorio y cómo se registran fábricas cuando hagan falta. Revisar también claves de propiedad de tipo `symbol`, mientras las referencias del AST actual usan nombres de tipo `string`. La primera entrega debe especificar el alcance de las columnas escalares y de la carga de relaciones.
- Definir el tipo de `count` y probarlo con el resultado real del driver. PostgreSQL entrega habitualmente un `COUNT` como cadena; una conversión a `number` necesita validar el rango seguro.
- Validar campos de ordenación con metadatos y definir un orden estable para la paginación. Un resultado paginado con total, al estilo `Page`, requiere un contrato propio. `findAll` con límite y desplazamiento puede devolver una lista en la primera entrega.
- Definir el comportamiento de `DataSource` antes de conectar, después de cerrar y ante fallos durante el arranque. Cada operación fuera de una transacción debe devolver su conexión al pool. Dentro de una transacción, el alcance gestiona la conexión compartida.

**Criterios de aceptación.** Probar arranque, selección y ausencia de proveedor, liberación de conexiones, entidades sin registrar, resultados vacíos, nombres físicos distintos de las propiedades, claves simples y compuestas, paginación y conteos. Verificar repositorios con PostgreSQL real y comprobar aislamiento, commit y rollback de las operaciones transaccionales. Cada archivo nuevo de implementación debe incluir su suite unitaria correspondiente.

#### Entrega A completada — Arranque y selección del motor

`DataSource.connect` registra las entidades y selecciona el cargador del mapa explícito `providers` por `type`. Para PostgreSQL, la configuración puede declarar `postgres: async () => (await import('@tyorm/postgres')).postgresProvider()`. El proveedor crea el driver y su compilador. `DataSource.execute` resuelve y ejecuta un SELECT y libera la conexión. `close` comparte un único cierre del pool y rechaza nuevas ejecuciones desde que comienza.

Validación del 20 de noviembre de 2026. Pasaron el build, ambos typecheck, el chequeo de tipos de pruebas de Core, 296 pruebas de Core y 118 de PostgreSQL. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución. Una aplicación temporal externa al workspace instaló ambos tarballs con npm y ejecutó un SELECT parametrizado en PostgreSQL. El tarball del driver se limitó a los artefactos compilados y al manifiesto.


#### Entrega B completada — Repositorios de lectura

`DataSource.getRepository(Entity)` usa el modelo registrado y el pipeline SELECT existente. `findById` devuelve la entidad o `null`; `existsById` consulta solo la existencia. Las claves simples se pasan como valor y las compuestas como objeto con todas sus propiedades. `findAll` devuelve una lista, acepta orden y paginación y agrega componentes faltantes de la clave primaria como desempate ascendente. `count` devuelve `bigint` para conservar la precisión.

Las consultas hidratan columnas escalares con nombres lógicos de tipo string. El repositorio usa el prototipo de la entidad y conserva valores del driver, incluidos los nulos. La hidratación omite constructores, inicializadores y relaciones. Cada ejecución usa y libera una conexión a través de `DataSource`; el alcance transaccional corresponde a la entrega C.

Validación del 20 de noviembre de 2026. Pasaron el build, ambos typecheck, el chequeo de tipos de las pruebas y 303 pruebas de Core y 119 de PostgreSQL. La integración consultó el catálogo con claves simples y compuestas, paginación, existencia y conteo. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.


#### Ampliación de la entrega B — Repositorios personalizados

`RepositoryDecorator`, importable como `Repository`, asocia una subclase de `ReadRepository<Entity, Id>` con una entidad registrada. `DataSource.getRepository` devuelve la subclase y conserva el acceso directo por entidad. La exportación existente `Repository` sigue siendo la clase base. Los métodos personalizados pueden usar `this.column` y `findAll({ where })` para conservar la resolución de metadatos, el enlace de parámetros y la hidratación.

Validación del 20 de noviembre de 2026. Pasaron el build, ambos typecheck, el chequeo estricto de las pruebas modificadas, 306 pruebas de Core y 119 de PostgreSQL. La integración ejecutó un método propio y uno heredado. Las otras tres suites de integración de PostgreSQL quedaron fuera de esta ejecución.

#### Entrega C completada — Repositorios en transacciones

`DataSource.transaction(callback, options)` entrega un `TransactionScope` con `getRepository` para entidades registradas y repositorios personalizados. Todos los repositorios del alcance ejecutan sus consultas en el mismo contexto administrado de `TransactionManager`. El contexto cierra el alcance y espera las operaciones en curso antes de finalizar la transacción. Las consultas de repositorios retenidos fuera del alcance se rechazan.

Validación del 23 de noviembre de 2026. Pasaron el build de Core, ambos typecheck, el typecheck de pruebas de Core, 308 pruebas de Core y 139 de PostgreSQL. Las pruebas unitarias comprobaron la conexión compartida, el commit, el rollback ante un error SQL y la liberación. La integración de repositorios confirmó el aislamiento serializable y el modo de solo lectura en PostgreSQL, además de comprobar el rechazo de consultas fuera del alcance y la recuperación tras abortar el callback.

#### Entrega D completada — Escrituras explícitas y save

`DataSource.executeMutation` y `TransactionScope.executeMutation` ejecutan INSERT, UPDATE y DELETE para una entidad registrada. Core resuelve los nombres físicos, valida propiedades de escritura y exige la clave primaria completa para actualizar o borrar. El INSERT aplica los defaults de metadatos y delega las claves generadas a la base de datos. PostgreSQL vincula todos los valores y devuelve las columnas escalares con los nombres lógicos de la entidad. Un proveedor puede seguir soportando solo SELECT; en ese caso ejecutar una mutación produce un error explícito.

Validación del 23 de noviembre de 2026. Pasaron ambos builds y typecheck, el typecheck de pruebas de Core, 310 pruebas de Core y 142 de PostgreSQL. La integración sobre una tabla temporal verificó la clave generada, la visibilidad de la actualización dentro de la transacción, su rollback, el commit del borrado y el resultado vacío al borrar una clave ausente.

`Repository.save(Partial<Entity>)` está disponible en repositorios de entidad y personalizados obtenidos de `DataSource` o de un alcance transaccional. Devuelve una instancia nueva con las columnas escalares persistidas y conserva el objeto de entrada.

- Si la entidad declara claves generadas y todas se omiten, `save` inserta. Si se informa alguna, exige la clave primaria completa y al menos una columna actualizable. Actualiza esa fila y produce un error si ya no existe.
- Para claves asignadas por la aplicación, `save` exige todos los componentes y los valores requeridos por el INSERT. PostgreSQL usa una sola sentencia `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`. En caso de conflicto solo aplica los campos actualizables suministrados. Si no se suministra ninguno, PostgreSQL asigna la clave a su mismo valor para devolver la fila, lo que puede activar triggers de UPDATE.
- Las escrituras concurrentes con clave asignada se resuelven por la restricción de clave primaria. Las columnas escritas por ambas operaciones conservan el valor de la última actualización efectiva. El nivel de aislamiento configurado rige la transacción y los errores de serialización se propagan al llamador.

Validación del 23 de noviembre de 2026. Pasaron ambos builds y typecheck, el typecheck de pruebas de Core, 312 pruebas de Core y 143 de PostgreSQL. La integración verificó los dos tipos de clave, la devolución de una entidad nueva, el rollback de un repositorio personalizado y dos guardados de la misma clave desde transacciones concurrentes en READ COMMITTED.

### 8.2 Segundo motor — SQLite

El paquete `@tyorm/sqlite` exporta `sqliteProvider` y usa `node:sqlite` con Node 22.16 o posterior dentro de la rama 22, o Node 24 en adelante. El proveedor se registra en `DataSource` con `sqlite: async () => (await import('@tyorm/sqlite')).sqliteProvider()`. La opción `database` admite una ruta o `:memory:`.

El compilador traduce SELECT, predicados, JOIN directos y de tabla intermedia, agrupación, agregados y paginación. El driver usa una conexión SQLite síncrona y serializa los préstamos para que una transacción mantenga el acceso exclusivo. Admite el aislamiento predeterminado de SQLite o `SERIALIZABLE` y revierte cualquier transacción abierta antes de liberar el préstamo. SQLite admite INSERT, UPDATE y DELETE mediante `executeMutation` y las operaciones de `Repository.save`. El compilador vincula valores, usa `RETURNING` para recuperar las columnas escalares y aplica `ON CONFLICT` con la clave primaria completa para claves asignadas. El driver cuenta las filas devueltas por las mutaciones compiladas.

Validación del 23 de noviembre de 2026 con Node 26.13. Pasaron el build de SQLite, los tres typecheck y 312 pruebas de Core, 143 de PostgreSQL y 6 de SQLite. En SQLite se verificaron la selección del proveedor, las lecturas transaccionales, la espera de otra conexión, el rollback al liberar, la conservación de enteros de 64 bits y la paginación con solo desplazamiento. Las pruebas de escritura en memoria cubren claves generadas, claves compuestas, filas afectadas, commit y rollback.

La suite `provider-parity.integration.test.ts` ejecuta las mismas comprobaciones de DataSource en ambos motores con tablas temporales. Cubre claves compuestas, paginación con orden estable y solo desplazamiento, JOIN directo, parámetros nombrados, GROUP BY/HAVING, claves generadas, UPSERT y commit/rollback. La comprobación del agregado normaliza el tipo devuelto por el driver. Las opciones de aislamiento y los tipos nativos se rigen por cada motor.

Validación del 23 de noviembre de 2026. Pasaron los tres typecheck, el chequeo estricto de la suite compartida y las suites completas con 312 pruebas de Core, 149 en el paquete PostgreSQL (incluidas las seis de paridad) y 6 en el paquete SQLite. Ejecutar solo la paridad con `pnpm --filter @tyorm/postgres exec vitest run --mode test tests/provider-parity.integration.test.ts`.

Validación de distribución del 23 de noviembre de 2026. Se instalaron los tarballs de Core y SQLite con npm sin acceso a la red, en una aplicación temporal externa al monorepo. La aplicación compiló con TypeScript, cargó `@tyorm/core/register` y el proveedor SQLite por importación dinámica, guardó una entidad con clave generada y recuperó el registro tras cerrar y reabrir el archivo. El build de Core incluye ahora la entrada pública `register`. El workspace pasó los tres builds y typecheck, el chequeo estricto de la prueba modificada y 468 pruebas en total, incluidas 7 del paquete SQLite y las seis de paridad.

### MySQL — proveedor y lectura inicial

`@tyorm/mysql` usa `mysql2` (3.24.6 en el lockfile) y conserva la estructura de carpetas de los demás drivers. El proveedor se registra en DataSource con el tipo `mysql`. El primer bloque cubre pool, ejecución parametrizada, transacciones y compilación SELECT. La entrega de escritura incorpora `executeMutation` y `Repository.save` con recuperación de filas por clave primaria. MySQL utiliza la misma conexión y transacción para la escritura y la lectura de la fila. Para claves generadas admite una columna AUTO_INCREMENT. Con claves asignadas intenta insertar y, ante un duplicado, actualiza únicamente si encuentra la clave primaria solicitada. La atomicidad requiere tablas transaccionales, como InnoDB.

Pasaron el build, los cuatro typecheck y la regresión del monorepo. Las cinco pruebas de MySQL, incluida la integración de repositorios dentro de una transacción de solo lectura, pasaron en una instancia aislada de MySQL 8.2.0. La integración se activa con `MYSQL_TEST_DATABASE`. Puede configurarse con `MYSQL_TEST_HOST`, `MYSQL_TEST_PORT`, `MYSQL_TEST_USER` y `MYSQL_TEST_PASSWORD` y ejecutarse con `pnpm --filter @tyorm/mysql test`.

Validación de escrituras. Pasaron los builds de Core y MySQL, los cuatro typecheck y 474 pruebas del monorepo. La integración contra MySQL 8.2.0 cubrió la clave generada, el retorno de filas, el guardado por clave compuesta, el conflicto en una clave única secundaria y el rollback.

Cierre del alcance MySQL. Pasaron los cuatro builds, los cuatro typecheck, el chequeo estricto de las dos suites modificadas y 478 pruebas sin omisiones. La suite de paridad ejecutó nueve casos entre PostgreSQL, SQLite y MySQL. En MySQL 8.2.0 se verificaron dos transacciones READ COMMITTED solapadas sobre la misma clave asignada en InnoDB. La prueba usa la tabla dedicada `tyorm_mysql_concurrent` y limpia únicamente su fila de prueba. Los tarballs de Core y MySQL se instalaron con npm en una aplicación temporal fuera del monorepo. Esa aplicación compiló y verificó carga dinámica del proveedor, generación de clave, lectura y actualización.
### 8.3 Regresión de transacciones PostgreSQL

Validación del 23 de noviembre de 2026. Pasaron los tres typecheck, el chequeo estricto de la suite modificada y 151 pruebas de PostgreSQL. `transaction-context.integration.test.ts` verifica el commit de escrituras que el callback deja pendientes, el orden de los errores SQL 23505 y 25P02, la reversión de una escritura previa y la reutilización de la misma sesión después del rollback. El fixture usa una tabla temporal y un pool con una sola conexión. Durante la suite, `pg` emitió una advertencia de obsolescencia al enviar otra consulta a un cliente ocupado.

Seguimiento de compatibilidad. PostgreSQLConnection serializa consultas, comandos de transacción y liberación por cliente. Un fallo individual conserva su error y permite continuar con el rollback o la liberación. Validación completa del 23 de noviembre de 2026. Pasaron `pnpm build`, `pnpm typecheck` y `pnpm test` con `NODE_OPTIONS=--throw-deprecation`. Pasaron 475 pruebas sin fallos ni omisiones (312 de Core, 156 de PostgreSQL y 7 de SQLite), incluida la integración con pgvector en localhost. La validación se hizo con la versión de pg del lockfile.

### 8.4 Consultas de vectores en PostgreSQL

`@Column({ type: 'vector' })` declara una propiedad vectorial. `vectorDistance` admite L2 y coseno. Core valida los componentes y resuelve la columna física. PostgreSQL vincula el vector como parámetro, usa los operadores de pgvector y delega al motor la comprobación de dimensiones. El proveedor SQLite rechaza esta expresión.

Pasaron el build de Core, los tres typecheck y 312 pruebas de Core, 154 del paquete PostgreSQL y 7 del paquete SQLite. La prueba de vecinos sobre PostgreSQL real quedó omitida porque pgvector no estaba habilitado en la base de pruebas.

Validación de extremo a extremo del 23 de noviembre de 2026. La integración pasó por el driver PostgreSQL de TyORM y `pg` contra un servidor TCP temporal de PGlite con la extensión pgvector 0.8.7. Verificó el orden y la distancia de los vecinos para L2 y coseno, y el error de dimensiones incompatibles. El servidor PostgreSQL local sigue sin la extensión. Para reproducir la prueba con una base que ya tenga pgvector habilitado, configurar sus variables PG y ejecutar `pnpm --filter @tyorm/postgres exec vitest run --mode test tests/vector.integration.test.ts`.

### 8.5 Procedimientos almacenados en MySQL

`MySQLDriver.acquireConnection()` devuelve una conexión MySQL que expone `callProcedure(nombre, parametros, esquema?)`. La llamada vincula los parámetros IN, cita el nombre y el esquema, y devuelve los conjuntos de filas en orden y el recuento final de filas afectadas que informa MySQL. En una transacción iniciada en esa conexión, la llamada comparte la sesión y su cola de operaciones. El llamador libera la conexión al finalizar.

Validación del 23 de noviembre de 2026. Pasaron los cuatro builds y typecheck y 483 pruebas, incluidas dos pruebas nuevas de conexión MySQL. Se omitieron cinco casos de integración y paridad que requieren MYSQL_TEST_DATABASE. La llamada a un procedimiento queda pendiente de validación contra un servidor MySQL.

Validación real completada el 23 de noviembre de 2026. La suite de MySQL pasó 12 pruebas contra MySQL local con `tyorm_test`, incluidas la creación y ejecución de un procedimiento dentro de una transacción y la limpieza del procedimiento. La conexión usa el protocolo textual para DDL de rutinas y conserva `callProcedure` con parámetros vinculados dentro de la cola transaccional.

Ampliación de parámetros de procedimientos. `callProcedure` admite descriptores `{ mode: 'in', value }`, `{ mode: 'out' }` y `{ mode: 'inout', value }`, además de valores directos para IN. Las variables de sesión OUT/INOUT son únicas por llamada, sus valores se recuperan en `outputParameters` por posición y se limpian en la misma conexión. Las pruebas unitarias y de integración MySQL validan OUT e INOUT reales dentro de una transacción.
### Funciones SQL de PostgreSQL

`DataSource.executeFunction` y `TransactionScope.executeFunction` invocan funciones existentes y devuelven sus filas. El compilador PostgreSQL cita el esquema y nombre por separado y vincula los argumentos posicionales mediante parámetros. El contexto administrado conserva la misma conexión durante la transacción. Los proveedores sin ese compilador rechazan la operación.

Validación del 23 de noviembre de 2026. Pasaron los tres builds y typecheck, el chequeo estricto de las pruebas modificadas y las suites con 313 pruebas de Core, 158 de PostgreSQL y 7 de SQLite. La integración en PostgreSQL local verificó el retorno de filas y la reversión de una escritura de la función.

### Procedimientos PostgreSQL con OUT e INOUT

`DataSource.executeProcedure` y `TransactionScope.executeProcedure` ejecutan CALL en PostgreSQL. Los valores de entrada se vinculan y cada marcador `{ mode: 'out' }` ocupa su posición con NULL. PostgreSQL devuelve las salidas nombradas en una fila de `QueryResult.rows`.

Validación del 23 de noviembre de 2026. Pasaron los tres builds y typecheck, el chequeo estricto de las pruebas de PostgreSQL modificadas y 479 pruebas sin omisiones (313 de Core, 159 de PostgreSQL y 7 de SQLite). La integración local verificó dos salidas OUT y la reversión de una escritura dentro del alcance transaccional.

La variante `{ mode: 'inout', value }` vincula el valor inicial y devuelve el actualizado en `rows`. La integración local verificó el valor actualizado junto a dos salidas OUT, en llamadas directas y dentro de una transacción con rollback. Pasaron el build, el typecheck, el chequeo estricto de las pruebas modificadas y las 479 pruebas del workspace.

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

## 11. Plan para validar la seguridad

Aplicar este proceso a cambios de seguridad y revisiones periódicas del monorepo. La revisión debe basarse en código, configuración y pruebas reales; distinguir vulnerabilidades confirmadas de recomendaciones de endurecimiento y no declarar el sistema seguro solo porque pasen las pruebas.

### 11.1 Alcance y entorno

1. Revisar Core y todos los drivers (`postgres`, `mysql`, `sqlite`), incluidos ejemplos, manifiestos, lockfile, configuración de pruebas y archivos ignorados.
2. Identificar entradas no confiables, límites de confianza, datos sensibles y operaciones que modifican estado en base de datos.
3. Ejecutar validaciones dinámicas únicamente en bases aisladas y datos sintéticos. No usar credenciales de producción ni correr pruebas destructivas contra bases de datos reales.

### 11.2 Prioridades de revisión estática

- **SQL e identificadores:** confirmar que los valores se vinculan como parámetros y que esquemas, tablas, columnas, aliases y nombres de rutinas se validan o citan con el dialecto correspondiente.
- **Procedimientos almacenados:** revisar parámetros `IN`, `OUT` e `INOUT`, resultados, variables de sesión, limpieza después de errores y serialización en la conexión.
- **Transacciones y recursos:** comprobar preservación de errores originales, rollback, estado de conexiones, liberación del pool y recuperación tras fallos.
- **Configuración y secretos:** buscar credenciales en archivos rastreados, ejemplos, logs y artefactos; verificar `.gitignore` y el contenido de los paquetes distribuidos.
- **TLS:** verificar el cifrado y la autenticación del servidor. En MySQL, si se configura `driverOptions.ssl`, el driver debe mantener la verificación de CA y hostname; los despliegues con bases remotas deben configurar TLS explícitamente. Decidir y documentar por separado si la política del producto exige hacerlo obligatorio para conexiones remotas.

Registrar únicamente hallazgos accionables con evidencia, severidad, confianza, precondiciones e impacto. No reportar como vulnerabilidad una posibilidad sin demostrar cómo se alcanza desde una entrada o configuración real.

### 11.3 Validación con pruebas

- Añadir casos focalizados para entradas con comillas y caracteres especiales, identificadores adversariales, parámetros inválidos y errores de rutinas.
- Confirmar que valores de usuario nunca alteren la estructura del SQL y que los fallos no dejen transacciones, variables de sesión o conexiones en estado inseguro.
- Para TLS, probar un certificado/CA válida y rechazar una CA no confiable o un hostname que no corresponda. No deshabilitar la validación para hacer pasar las pruebas.
- Ejecutar `pnpm typecheck`, `pnpm build` y `pnpm test`, además de las pruebas focalizadas del paquete afectado. Registrar aprobadas, fallidas y omitidas por separado.

Validación TLS MySQL del 23 de noviembre de 2026: OpenSSL confirmó una conexión TLS 1.3 con la CA de prueba y `localhost`, y rechazó un hostname distinto. Una prueba focalizada de TyORM pasó 3 casos: conexión con CA confiable y cipher de sesión presente, rechazo de CA incorrecta y rechazo de hosts IP al exigir verificación de identidad DNS. El servicio MySQL necesitó permiso de lectura para `NT AUTHORITY\NETWORK SERVICE` sobre la carpeta y los tres archivos TLS requeridos; la clave privada de la CA no se compartió con el servicio.

### 11.4 Integraciones, dependencias y distribución

1. Verificar los drivers contra instancias aisladas con permisos mínimos y configuraciones representativas, incluido MySQL con TLS si se modifica conexión o autenticación.
2. Revisar dependencias directas y transitivas con las herramientas de auditoría aprobadas para el entorno, evaluando impacto y versiones efectivamente usadas.
3. Inspeccionar tarballs y artefactos publicados para asegurar que no incluyan `.env`, claves privadas, certificados confidenciales, contraseñas ni datos de pruebas.

Endurecimiento del 23 de noviembre de 2026: las pruebas `*.integration.test.ts` de PostgreSQL y MySQL quedan excluidas por defecto. Para habilitarlas se requiere `TYORM_RUN_DB_INTEGRATION=1`, confirmación explícita `TYORM_TEST_DATABASE_ISOLATED=1`, la base configurada exactamente como `tyorm_test` y un usuario distinto de las cuentas administrativas por defecto. La barrera reduce ejecuciones accidentales, pero no verifica los grants efectivos; sigue recomendándose crear cuentas dedicadas con permisos mínimos limitados a la base desechable.

Validación de fase 11.4: typecheck de PostgreSQL y MySQL aprobados; pasaron 123 pruebas unitarias de PostgreSQL y 14 de MySQL con las integraciones excluidas. Se comprobó que la ejecución optativa rechaza las cuentas administrativas actuales. Los dry-runs de empaquetado de Core y los tres drivers incluyeron solo `dist` y `package.json`; no se encontraron `.env`, PEM, claves privadas, certificados, contraseñas ni datos de prueba en `dist`. No se confirmó una vulnerabilidad en dependencias directas; no se pudo ejecutar auditoría de avisos publicados sin conectividad externa. Las integraciones PostgreSQL/MySQL quedan pendientes hasta configurar usuarios de prueba no administrativos y verificar el aislamiento; la propiedad de las bases y los permisos mínimos no se comprobaron de forma independiente.

### 11.5 Cierre

Priorizar correcciones por severidad y confianza, aplicar cambios quirúrgicos y añadir pruebas de regresión. Repetir las validaciones afectadas y documentar riesgos residuales, limitaciones del análisis y cualquier decisión pendiente. Una revisión estática no sustituye pruebas de integración ni certifica la configuración de cada despliegue.

Cierre de revisión de código y configuración del 23 de noviembre de 2026: las fases 11.1–11.5 quedan cerradas en ese alcance, sin vulnerabilidades confirmadas pendientes. Las pruebas PostgreSQL/MySQL ahora exigen opt-in y rechazan las cuentas administrativas por defecto; pasaron los typecheck y las suites unitarias focalizadas. La validación dinámica completa sigue pendiente: provisionar cuentas dedicadas, verificar de forma independiente que las bases sean desechables y que los grants sean mínimos, ejecutar las integraciones y realizar una auditoría de avisos de dependencias con una fuente aprobada. No declarar certificada la seguridad integral hasta completar esas condiciones.
