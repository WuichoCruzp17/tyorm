# `@tyorm/mysql`

The MySQL adapter supplies the `mysql2`-based driver and SQL compiler. Applications normally use `mysqlProvider()` with Core's `DataSource`.

## Application setup

Install `@tyorm/core` and `@tyorm/mysql`, then configure a provider:

```ts
import { DataSource } from "@tyorm/core";

const db = await DataSource.connect({
  type: "mysql",
  database: process.env.MYSQL_DATABASE!,
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT === undefined ? undefined : Number(process.env.MYSQL_PORT),
  username: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  providers: {
    mysql: async () => (await import("@tyorm/mysql")).mysqlProvider(),
  },
  entities: [User],
});
```

Replace `User` with your registered entity classes. Close the DataSource during application shutdown. Use transactional tables such as InnoDB for atomic writes. Generated primary keys require `AUTO_INCREMENT`.

Core's common driver settings include the database, host, port, username, password, and pool options. This adapter uses `pool.max` for the connection limit and `pool.idleTimeoutMs` for its idle timeout; `pool.min` and `pool.acquireTimeoutMs` are not currently mapped.

## Connection pool

Each `MySQLDriver` owns one `mysql2` pool per `DataSource`. The default maximum
is 10 connections (`pool.max`) and the default idle timeout is 60 seconds
(`pool.idleTimeoutMs`). The driver does not apply Core's `pool.min` or
`pool.acquireTimeoutMs`.

An operation checks out a connection from the shared pool and returns it when
released. A transaction keeps that connection until commit or rollback;
releasing an active transaction rolls it back first. Requests beyond the pool
limit wait for a connection according to `mysql2`'s pool behavior.
`DataSource.close()` ends the pool. The connection limit applies to each
DataSource's pool, not globally across multiple DataSources or application
processes.

## MySQL-specific behavior

- `MySQLConnection.callProcedure` supports `IN`, `OUT`, and `INOUT` arguments. It runs on an acquired connection and shares that connection's transaction when one is active. The MySQL SQL compiler does not implement Core's `DataSource.executeFunction` or `DataSource.executeProcedure` compilation hooks.
- Repository saves recover the persisted row on the same connection. Assigned-key conflict handling updates supplied fields; atomicity requires a transactional table engine.
- `driverOptions.ssl` must be an SSL options object. When TLS is configured, the driver enforces certificate-chain and hostname verification and requires a DNS hostname. TLS remains optional for local development; configure it for remote databases.
- SQL values are bound parameters. Use the high-level `DataSource` APIs for entity and query validation.

For runnable repository, connection, and stored-procedure examples, see [`examples/README.md`](examples/README.md). General API examples are in the [root README](../../../README.md).

## Development and tests

From the monorepo root:

```powershell
pnpm --filter @tyorm/mysql typecheck
pnpm --filter @tyorm/mysql test
pnpm --filter @tyorm/mysql build
```

Database integrations are excluded by default. Before enabling them, verify the database is disposable and the account is non-administrative with least privileges. The guard requires `MYSQL_TEST_DATABASE=tyorm_test`, `TYORM_RUN_DB_INTEGRATION=1`, and `TYORM_TEST_DATABASE_ISOLATED=1`; configure `MYSQL_TEST_USER` and connection settings in the ignored `.env.test` file. The confirmation variable does not independently verify isolation. See the [root README development section](../../../README.md#development).

The package root exposes the provider, driver, connection API, and SELECT compiler. `MySQLConnection` is an advanced low-level API; it can execute SQL and should remain within trusted application code.

The public exports are `mysqlProvider`, `MySQLDriver`, `MySQLConnection`, its procedure argument/result types, and `MySQLSelectCompiler`.
