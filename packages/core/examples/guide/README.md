# Guía de uso de TyORM con PostgreSQL

La guía usa las APIs de `@tyorm/core` y `@tyorm/postgres`. Carga datos de ejemplo en tablas temporales y ejecuta todos los capítulos en una sola conexión. PostgreSQL elimina esas tablas al confirmar la transacción. El usuario de la base de pruebas necesita permiso para crear tablas temporales.

## Ejecutar la guía

Desde la raíz del repositorio, configura `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` en tu entorno, según tu servidor de pruebas. Con las dependencias del monorepo instaladas, ejecuta:

```powershell
pnpm build
pnpm exec tsc -p packages/core/examples/guide/tsconfig.json
pnpm exec tsc -p packages/core/examples/guide/tsconfig.legacy.json
node packages/core/examples/guide/run.mjs
```

Si ya tienes configurado el archivo local de las pruebas de PostgreSQL, puedes cargarlo con Node al ejecutar la guía:

```powershell
node --env-file=packages/drivers/postgres/.env.test packages/core/examples/guide/run.mjs
```

## Capítulos

| Archivo | Qué muestra |
| --- | --- |
| [models.ts](models.ts) | Entidades Stage 3, nombres físicos, claves primarias, las cuatro relaciones y sus metadatos. |
| [queries.ts](queries.ts) | Construcción del AST, resolución y compilación a SQL parametrizado. Incluye filtros, paginación, joins directos e inversos, ManyToMany, agrupación y agregados. |
| [projections.ts](projections.ts) | Proyección automática, DTO explícito y esquema estilo record reutilizado. |
| [transactions.ts](transactions.ts) | Confirmación de una transacción, rollback con causa original y ejecución en un contexto administrado. |
| [legacy.ts](legacy.ts) | Decoradores de TypeScript con `experimentalDecorators: true` y una consulta real sobre la entidad resultante. |
| [sample-data.ts](sample-data.ts) y [main.ts](main.ts) | Datos temporales, apertura del driver y ejecución de los capítulos. |

La consulta con `LEFT JOIN` incluye los departamentos sin empleados activos. En las proyecciones, Sam tiene cero roles con `COUNT(role.id)`. La segunda consulta con el mismo record muestra que `COUNT(*)` cuenta la fila producida por el `LEFT JOIN` incluso cuando no hay rol.
