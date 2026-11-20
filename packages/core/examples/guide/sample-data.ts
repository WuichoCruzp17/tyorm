import type { DatabaseConnection } from '@tyorm/core';

export async function seed(connection: DatabaseConnection): Promise<void> {
    // Todas las tablas existen únicamente en esta conexión de PostgreSQL.
    const tables = [
        `CREATE TEMP TABLE demo_departments (
            department_id integer PRIMARY KEY, name text NOT NULL
        ) ON COMMIT DROP`,
        `CREATE TEMP TABLE demo_profiles (
            profile_id integer PRIMARY KEY, location text NOT NULL
        ) ON COMMIT DROP`,
        `CREATE TEMP TABLE demo_roles (
            role_id integer PRIMARY KEY, title text NOT NULL, level integer NOT NULL
        ) ON COMMIT DROP`,
        `CREATE TEMP TABLE demo_employees (
            employee_id integer PRIMARY KEY, display_name text NOT NULL, active boolean NOT NULL,
            department_fk integer NOT NULL REFERENCES pg_temp.demo_departments,
            profile_fk integer NOT NULL UNIQUE REFERENCES pg_temp.demo_profiles
        ) ON COMMIT DROP`,
        `CREATE TEMP TABLE demo_employee_roles (
            employee_fk integer REFERENCES pg_temp.demo_employees,
            role_fk integer REFERENCES pg_temp.demo_roles,
            PRIMARY KEY (employee_fk, role_fk)
        ) ON COMMIT DROP`
    ];
    for (const sql of tables) {
        await connection.execute({ sql });
    }

    await connection.execute({
        sql: 'INSERT INTO pg_temp.demo_departments VALUES (1, $1), (2, $2), (3, $3)',
        parameters: ['Ingeniería', 'Ventas', 'Operaciones']
    });
    await connection.execute({
        sql: 'INSERT INTO pg_temp.demo_profiles VALUES (1, $1), (2, $2), (3, $3)',
        parameters: ['Ciudad de México', 'Monterrey', 'Guadalajara']
    });
    await connection.execute({
        sql: 'INSERT INTO pg_temp.demo_roles VALUES (1, $1, 2), (2, $2, 4)',
        parameters: ['Desarrollo', 'Revisión']
    });
    await connection.execute({
        sql: 'INSERT INTO pg_temp.demo_employees VALUES ' +
            '(1, $1, true, 1, 1), (2, $2, true, 1, 2), (3, $3, false, 2, 3)',
        parameters: ['Ada', 'Lin', 'Sam']
    });
    await connection.execute({
        sql: 'INSERT INTO pg_temp.demo_employee_roles VALUES (1, 1), (1, 2), (2, 1)'
    });
}
