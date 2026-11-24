-- Ejecutar desde pgAdmin Query Tool conectado a tyorm_test como administrador.
-- Antes de ejecutar, reemplazar REPLACE_WITH_TEST_ROLE por el rol LOGIN de pruebas.
DO $grant_test_permissions$
DECLARE
    test_role_name NAME := 'REPLACE_WITH_TEST_ROLE';
    test_role PG_ROLES%ROWTYPE;
BEGIN
    IF current_database() <> 'tyorm_test' THEN
        RAISE EXCEPTION 'Refusing to grant permissions outside tyorm_test';
    END IF;

    SELECT *
    INTO test_role
    FROM pg_roles
    WHERE rolname = test_role_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Test role "%" does not exist', test_role_name;
    END IF;

    IF NOT test_role.rolcanlogin
        OR test_role.rolsuper
        OR test_role.rolcreatedb
        OR test_role.rolcreaterole
        OR test_role.rolreplication
        OR test_role.rolbypassrls
    THEN
        RAISE EXCEPTION 'Test role "%" must be a restricted LOGIN role', test_role_name;
    END IF;

    EXECUTE format(
        'CREATE SCHEMA IF NOT EXISTS tyorm_test AUTHORIZATION %I',
        test_role_name
    );

    EXECUTE format(
        'GRANT CONNECT, TEMPORARY ON DATABASE tyorm_test TO %I',
        test_role_name
    );
    EXECUTE format(
        'GRANT USAGE, CREATE ON SCHEMA tyorm_test TO %I',
        test_role_name
    );

    CREATE TABLE IF NOT EXISTS tyorm_test.transaction_test (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tyorm_test.transaction_manager_test (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL
    );

    EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE tyorm_test.transaction_test TO %I',
        test_role_name
    );
    EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE tyorm_test.transaction_manager_test TO %I',
        test_role_name
    );
END
$grant_test_permissions$;
