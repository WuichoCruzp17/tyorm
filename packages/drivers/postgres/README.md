# `@tyorm/postgres`

The PostgreSQL adapter supplies the `pg`-based driver and SQL compiler for TyORM. Normal applications should register `postgresProvider()` with Core's `DataSource`.

## Application setup

Install `@tyorm/core` and `@tyorm/postgres`, then register the provider:

```ts
import { DataSource } from "@tyorm/core";

const db = await DataSource.connect({
  type: "postgres",
  database: process.env.PGDATABASE!,
  host: process.env.PGHOST,
  port: process.env.PGPORT === undefined ? undefined : Number(process.env.PGPORT),
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  providers: {
    postgres: async () => (await import("@tyorm/postgres")).postgresProvider(),
  },
  entities: [User],
});
```

Replace `User` with your registered entity classes. Close the DataSource during application shutdown. Prefer Core's `DataSource` and repository APIs; direct drivers and connection leases are low-level trusted-code capabilities.

The Core `DriverConfig` fields include `database`, `host`, `port`, `username`, `password`, and pool settings (`min`, `max`, `acquireTimeoutMs`, `idleTimeoutMs`). `driverOptions` is forwarded to `pg`'s pool configuration. For remote databases, configure TLS using the supported `pg` SSL options and a trusted CA; do not disable certificate verification.

## PostgreSQL features

The provider compiles SELECT and mutation operations, relationship joins, grouping and aggregates, and pagination. PostgreSQL-specific query features include:

- Function and procedure calls through `DataSource` or a transaction scope.
- Vector-distance queries when pgvector is installed and the vector dimensions match.
- PostgreSQL isolation levels and read-only transaction configuration.
- Generated keys and `ON CONFLICT` behavior for repository saves.

The compiler emits bound parameters and quotes identifiers through its SQL dialect. For API examples and behavior shared across providers, see the [root README](../../../README.md).

## Development and tests

From the monorepo root:

```powershell
pnpm --filter @tyorm/postgres typecheck
pnpm --filter @tyorm/postgres exec vitest run --mode test tests/postgres-select-compiler.test.ts
pnpm --filter @tyorm/postgres test
pnpm --filter @tyorm/postgres build
```

Database integrations are excluded by default. To enable them, first verify that the configured database is disposable and the login is a non-administrative test account with least privileges. The test guard requires `PGDATABASE=tyorm_test`, `TYORM_RUN_DB_INTEGRATION=1`, and `TYORM_TEST_DATABASE_ISOLATED=1`; credentials can be supplied through the driver's ignored `.env.test` file. The isolation variable is an operator confirmation, not proof by itself. See the [root README development section](../../../README.md#development).

Connection pools, connection classes, and compiler helper classes are internal package details.

The public exports are `postgresProvider`, `PostgreSQLDriver`, `PostgresSelectCompiler`, and `TransactionOutcomeUnknownError`. Use the provider by default; construct the driver or compiler directly only for advanced integrations.
