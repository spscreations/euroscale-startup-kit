-- This file is executed immediately after initializing a fresh MySQL data directory.
-- Customized for EuroScale: uses mysql_native_password for vt_dba compatibility.

SET @original_super_read_only=IF(@@global.super_read_only=1, 'ON', 'OFF');
SET GLOBAL super_read_only='OFF';
SET sql_log_bin = 0;

-- Remove anonymous users & disable remote root access
DROP USER IF EXISTS ''@'%', ''@'localhost', 'root'@'%';
DROP DATABASE IF EXISTS test;

-- Vitess admin user with mysql_native_password (required for Vitess compatibility)
CREATE USER 'vt_dba'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
GRANT ALL ON *.* TO 'vt_dba'@'localhost';
GRANT GRANT OPTION ON *.* TO 'vt_dba'@'localhost';
GRANT PROXY ON ''@'' TO 'vt_dba'@'localhost' WITH GRANT OPTION;

-- User for app traffic, with global read-write access
CREATE USER 'vt_app'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, PROCESS, FILE,
 REFERENCES, INDEX, ALTER, SHOW DATABASES, CREATE TEMPORARY TABLES,
 LOCK TABLES, EXECUTE, REPLICATION CLIENT, CREATE VIEW,
 SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER
 ON *.* TO 'vt_app'@'localhost';

-- User for app debug traffic, with global read access
CREATE USER 'vt_appdebug'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
GRANT SELECT, SHOW DATABASES, PROCESS ON *.* TO 'vt_appdebug'@'localhost';

-- User for administrative operations that need to be executed as non-SUPER
CREATE USER 'vt_allprivs'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, PROCESS, FILE,
 REFERENCES, INDEX, ALTER, SHOW DATABASES, CREATE TEMPORARY TABLES,
 LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW,
 SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER
 ON *.* TO 'vt_allprivs'@'localhost';

-- User for slave replication connections
CREATE USER 'vt_repl'@'%' IDENTIFIED WITH mysql_native_password BY '';
GRANT REPLICATION SLAVE ON *.* TO 'vt_repl'@'%';

-- User for Vitess VReplication
CREATE USER 'vt_filtered'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, PROCESS, FILE,
 REFERENCES, INDEX, ALTER, SHOW DATABASES, CREATE TEMPORARY TABLES,
 LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW,
 SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER
 ON *.* TO 'vt_filtered'@'localhost';

-- User for general MySQL monitoring
CREATE USER 'vt_monitoring'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
GRANT SELECT, PROCESS, SUPER, REPLICATION CLIENT, RELOAD
 ON *.* TO 'vt_monitoring'@'localhost';
GRANT SELECT, UPDATE, DELETE, DROP
 ON performance_schema.* TO 'vt_monitoring'@'localhost';

SET GLOBAL super_read_only=IFNULL(@original_super_read_only, 'ON');
