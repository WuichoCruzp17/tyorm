# MySQL examples

Build the MySQL package first, then run an example from the repository root:

```powershell
pnpm --filter @tyorm/mysql build
node --env-file=packages/drivers/mysql/.env.test packages/drivers/mysql/examples/basic-connection.mjs
node --env-file=packages/drivers/mysql/.env.test packages/drivers/mysql/examples/repository.mjs
node --env-file=packages/drivers/mysql/.env.test packages/drivers/mysql/examples/stored-procedure.mjs
```

The examples use the `MYSQL_TEST_*` connection settings and default to the dedicated `tyorm_test` database. `basic-connection.mjs` demonstrates parameterized SQL with a transaction, `repository.mjs` demonstrates `DataSource` and repository operations, and `stored-procedure.mjs` demonstrates `IN`, `OUT`, and `INOUT` parameters.

For remote databases, configure verified TLS with a DNS hostname:

```js
import { readFileSync } from 'node:fs';

const config = {
    type: 'mysql',
    host: 'mysql.example.com',
    database: 'app',
    username: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    driverOptions: {
        ssl: { ca: readFileSync(process.env.MYSQL_CA_FILE, 'utf8') }
    }
};
```

The driver enforces certificate-chain and hostname verification whenever `driverOptions.ssl` is supplied. TLS profiles as strings and IP-address hosts are rejected to avoid connections without identity verification. TLS remains opt-in for compatibility with local development servers.
