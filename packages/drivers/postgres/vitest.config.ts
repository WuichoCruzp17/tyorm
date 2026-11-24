
import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(
        mode,
        process.cwd(),
        ''
    );
    const runDatabaseIntegrations = env.TYORM_RUN_DB_INTEGRATION === '1';

    if (runDatabaseIntegrations) {
        assertSafeTestDatabase(env, 'PGDATABASE', 'PGUSER', ['postgres', 'root']);
        if (env.MYSQL_TEST_DATABASE) {
            assertSafeTestDatabase(env, 'MYSQL_TEST_DATABASE', 'MYSQL_TEST_USER', ['root']);
        }
    }

    return {
        test: {
            exclude: [
                ...configDefaults.exclude,
                ...(runDatabaseIntegrations ? [] : ['tests/**/*.integration.test.ts'])
            ],
            setupFiles: [
                './tests/setup/symbol-metadata.ts'
            ],
            env
        }
    };
});

function assertSafeTestDatabase(
    env: Record<string, string>,
    databaseKey: string,
    usernameKey: string,
    privilegedUsernames: readonly string[]
): void {
    const database = env[databaseKey];
    const username = env[usernameKey];

    if (env.TYORM_TEST_DATABASE_ISOLATED !== '1') {
        throw new Error('Set TYORM_TEST_DATABASE_ISOLATED=1 only after confirming the database is disposable.');
    }
    if (database !== 'tyorm_test') {
        throw new Error(`${databaseKey} must be explicitly set to "tyorm_test" to run database integrations.`);
    }
    if (!username || privilegedUsernames.includes(username.toLowerCase())) {
        throw new Error(`${usernameKey} must be set to a non-administrative test account.`);
    }
}
