import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const runDatabaseIntegrations = env.TYORM_RUN_DB_INTEGRATION === '1';

    if (runDatabaseIntegrations && env.MYSQL_TEST_DATABASE) {
        assertSafeTestDatabase(env);
    }

    return {
        test: {
            exclude: [
                ...configDefaults.exclude,
                ...(runDatabaseIntegrations ? [] : ['tests/**/*.integration.test.ts'])
            ],
            setupFiles: ['./tests/setup/symbol-metadata.ts'],
            env
        }
    };
});

function assertSafeTestDatabase(env: Record<string, string>): void {
    if (env.TYORM_TEST_DATABASE_ISOLATED !== '1') {
        throw new Error('Set TYORM_TEST_DATABASE_ISOLATED=1 only after confirming the database is disposable.');
    }
    if (env.MYSQL_TEST_DATABASE !== 'tyorm_test') {
        throw new Error('MYSQL_TEST_DATABASE must be explicitly set to "tyorm_test" to run database integrations.');
    }
    if (!env.MYSQL_TEST_USER || env.MYSQL_TEST_USER.toLowerCase() === 'root') {
        throw new Error('MYSQL_TEST_USER must be set to a non-administrative test account.');
    }
}
