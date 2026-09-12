DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'qts_app') THEN
    CREATE ROLE qts_app WITH LOGIN PASSWORD 'change-me';
  END IF;
END
$$;

SELECT 'CREATE DATABASE qts OWNER qts_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'qts')
\gexec
