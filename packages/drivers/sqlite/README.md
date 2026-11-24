# `@tyorm/sqlite`

The SQLite adapter uses Node.js's built-in `node:sqlite` module and does not require a separate native driver dependency.

## Requirements and setup

The package requires Node.js `^22.16.0 || >=24.0.0`. Install `@tyorm/core` and `@tyorm/sqlite`, then register the provider:

```ts
import { DataSource } from "@tyorm/core";

const db = await DataSource.connect({
  type: "sqlite",
  database: process.env.SQLITE_DATABASE ?? "./app.sqlite",
  providers: {
    sqlite: async () => (await import("@tyorm/sqlite")).sqliteProvider(),
  },
  entities: [User],
});
```

Replace `User` with your registered entity classes. Use `":memory:"` for an in-memory database or a filesystem path for a persistent database. Close the DataSource to release the database handle.

## SQLite behavior

- The driver owns one synchronous SQLite connection per DataSource and serializes connection leases. In-memory databases are shared by all operations through that DataSource.
- Transactions support SQLite's default isolation or `SERIALIZABLE`. `readOnly: true` and other isolation levels are rejected.
- SELECT, relationship joins, grouping, aggregates, pagination, and mutations are compiled by the adapter. Vector-distance expressions are not supported.
- Keep database files and connection handles within trusted application code; use repositories and `DataSource` for ordinary operations.

See the [root README](../../../README.md) for shared API examples and the [Core guide](../../core/examples/guide/README.md) for query and transaction examples.

## Development and tests

From the monorepo root:

```powershell
pnpm --filter @tyorm/sqlite typecheck
pnpm --filter @tyorm/sqlite test
pnpm --filter @tyorm/sqlite build
```

The package tests use in-memory SQLite and do not require a separate database server. Its package entry exports the provider, driver, and SELECT compiler; connection and compiler-helper implementations are internal package details.

The public exports are `sqliteProvider`, `SQLiteDriver`, and `SQLiteSelectCompiler`. Applications normally need only the provider.
