-- Ejecutar como administrador de MySQL.
-- La cuenta objetivo se confirmó como CURRENT_USER(): 'test'@'localhost'.
-- Primero se conceden permisos solo en tyorm_test; después se quitan los globales.
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, CREATE TEMPORARY TABLES,
      EXECUTE, CREATE ROUTINE, ALTER ROUTINE
ON tyorm_test.* TO 'test'@'localhost';

REVOKE SELECT, INSERT, DELETE, CREATE, DROP, INDEX, ALTER,
       CREATE TEMPORARY TABLES, EXECUTE
ON *.* FROM 'test'@'localhost';

SHOW GRANTS FOR 'test'@'localhost';
