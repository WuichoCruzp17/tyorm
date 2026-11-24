# `@tyorm/sqlserver`

The SQL Server adapter provides the SQL Server driver and T-SQL compiler for
TyORM. It currently requires Node.js 22 or later. Applications register it
explicitly with Core's `DataSource`.

## Application setup

Install `@tyorm/core` and `@tyorm/sqlserver`, then configure a provider:

```ts
import { DataSource } from "@tyorm/core";

const db = await DataSource.connect({
  type: "sqlserver",
  host: process.env.SQLSERVER_HOST,
  port: process.env.SQLSERVER_PORT === undefined ? undefined : Number(process.env.SQLSERVER_PORT),
  database: process.env.SQLSERVER_DATABASE!,
  username: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  providers: {
    sqlserver: async () => (await import("@tyorm/sqlserver")).sqlServerProvider(),
  },
  entities: [User],
});
```

Replace `User` with registered entity classes. Close the `DataSource` during
application shutdown. The initial implementation supports SQL Login
credentials only; integrated and managed-identity authentication are not
implemented. Use a least-privilege account.

## Supported behavior in the initial implementation

- `DataSource` provider and pooled SQL Login connections.
- TLS encryption and server-certificate validation are enabled by default.
  `driverOptions.trustServerCertificate` and `driverOptions.encrypt` can
  override those settings; do not disable verification for remote servers.
- SELECT compilation supports the Core expression, predicate, relation join,
  grouping, aggregate, and pagination nodes except vector distance. Pagination
  without an explicit order uses `ORDER BY (SELECT NULL)` and is not stable
  across executions.
- `DataSource.executeProcedure` supports stored procedures with IN parameters.
  OUT and INOUT parameters are rejected until their SQL Server type mapping is
  defined. Scalar function execution is supported; table-valued functions are
  not currently mapped.
- INSERT, UPDATE, DELETE, and `Repository.save` compile to SQL Server
  statements, but real-engine validation is still pending. Returned values use
  the SQL Server `OUTPUT` clause, so tables with enabled triggers are not
  currently supported for these mutations. Assigned-key saves use `MERGE` with
  `HOLDLOCK`; concurrency behavior still requires integration testing.
- SQL Server read-only transactions are rejected explicitly.

## Connection pool

`SqlServerDriver.connect()` creates one `mssql` `ConnectionPool` that is shared
for the lifetime of the driver. The pool defaults to `min: 0` and `max: 10`.
Configure its supported limits through `DataSource`:

```ts
pool: {
  min: 0,
  max: 10,
  idleTimeoutMs: 30_000,
}
```

`idleTimeoutMs` is optional. Each `DataSource` operation gets a logical
connection wrapper; SQL requests use the shared pool, and `release()` ends the
wrapper rather than closing the pool. A transaction uses one pooled connection
until commit or rollback; releasing a wrapper with an active transaction rolls
it back. `DataSource.close()` closes the shared pool and prevents further use.

The Core `pool.acquireTimeoutMs` option is not currently applied by this
driver. At the pool's connection limit, additional requests wait according to
the underlying `mssql` pool behavior. The maximum is per `DataSource`, not
global across multiple DataSources or application processes.

The package is in progress under phase 8.10. Consult the root
[`AGENTS.md`](../../../AGENTS.md) for the phase scope and acceptance criteria.
The package root exports `sqlServerProvider`, `SqlServerDriver`, and
`SqlServerSelectCompiler`; use the provider for normal application setup.
Direct driver construction and acquired `DatabaseConnection` objects are
advanced, privileged capabilities that can execute raw SQL. Keep them within
trusted code. `SqlServerConnection` is internal and is not exported from the
package root.

## Development

From the monorepo root:

```powershell
pnpm --filter @tyorm/sqlserver typecheck
pnpm --filter @tyorm/sqlserver test
pnpm --filter @tyorm/sqlserver build
```

Database integrations are excluded by default. Enable them only after
independently confirming a disposable database and a non-administrative
least-privilege account. The guard requires
`SQLSERVER_TEST_DATABASE=tyorm_test`,
`TYORM_RUN_DB_INTEGRATION=1`, and
`TYORM_TEST_DATABASE_ISOLATED=1`. Configure credentials in an ignored
`.env.test` file; the confirmation flag does not independently verify
isolation.
