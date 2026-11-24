# MySQL examples

Build the MySQL package first, then run an example from the repository root:

```powershell
pnpm --filter @tyorm/mysql build
node --env-file=packages/drivers/mysql/.env.test packages/drivers/mysql/examples/basic-connection.mjs
node --env-file=packages/drivers/mysql/.env.test packages/drivers/mysql/examples/repository.mjs
node --env-file=packages/drivers/mysql/.env.test packages/drivers/mysql/examples/stored-procedure.mjs
```

The examples use the `MYSQL_TEST_*` connection settings and default to the dedicated `tyorm_test` database. `basic-connection.mjs` demonstrates parameterized SQL with a transaction, `repository.mjs` demonstrates `DataSource` and repository operations, and `stored-procedure.mjs` demonstrates `IN`, `OUT`, and `INOUT` parameters.
