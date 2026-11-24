import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const runDatabaseIntegrations = env.TYORM_RUN_DB_INTEGRATION === '1';

    if (runDatabaseIntegrations) assertSafeTestDatabase(env);

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
    if (env.SQLSERVER_TEST_DATABASE !== 'tyorm_test') {
        throw new Error('SQLSERVER_TEST_DATABASE must be explicitly set to "tyorm_test" to run database integrations.');
    }
    if (!env.SQLSERVER_TEST_USER || ['sa', 'administrator', 'admin'].includes(env.SQLSERVER_TEST_USER.toLowerCase())) {
        throw new Error('SQLSERVER_TEST_USER must be set to a non-administrative test account.');
    }
}
