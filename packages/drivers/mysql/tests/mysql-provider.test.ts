import { expect, it } from 'vitest';
import { MySQLDriver, MySQLSelectCompiler, mysqlProvider } from '../src';

it('provides compatible MySQL components', async () => {
    const { driver, compiler } = await mysqlProvider();
    expect(driver).toBeInstanceOf(MySQLDriver);
    expect(compiler).toBeInstanceOf(MySQLSelectCompiler);
});
