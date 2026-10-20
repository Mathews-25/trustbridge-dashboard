-- The container's POSTGRES_USER is the local migration/admin role.
-- Runtime Prisma connections use the restricted role below.
CREATE ROLE trustbridge_app LOGIN NOSUPERUSER NOBYPASSRLS
  PASSWORD 'trustbridge-app-dev-password';

GRANT CONNECT ON DATABASE trustbridge_dashboard TO trustbridge_app;
GRANT USAGE ON SCHEMA public TO trustbridge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trustbridge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trustbridge_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trustbridge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO trustbridge_app;