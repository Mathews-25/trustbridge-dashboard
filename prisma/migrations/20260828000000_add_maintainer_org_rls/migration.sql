-- Add a tenant discriminator to every persisted table. Existing rows are
-- assigned to the default tenant and must be remapped before multi-tenant use.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'TokenAuditLog', 'Registration', 'dispute_proofs',
    'AddressHistoryRecord', 'AuditLog', 'Invite', 'QueueJob', 'Account',
    'Session', 'VerificationToken'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS "maintainerOrgId" TEXT NOT NULL DEFAULT ''default''',
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- The application role must set this parameter on every connection. A
-- missing parameter intentionally matches no tenant, rather than exposing all rows.
CREATE OR REPLACE FUNCTION public.current_maintainer_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.maintainer_org_id', true), '')
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'TokenAuditLog', 'Registration', 'dispute_proofs',
    'AddressHistoryRecord', 'AuditLog', 'Invite', 'QueueJob', 'Account',
    'Session', 'VerificationToken'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN "maintainerOrgId" SET DEFAULT COALESCE(public.current_maintainer_org_id(), ''default'')',
        table_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'TokenAuditLog', 'Registration', 'dispute_proofs',
    'AddressHistoryRecord', 'AuditLog', 'Invite', 'QueueJob', 'Account',
    'Session', 'VerificationToken'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        table_name || '_maintainer_org_isolation', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I USING ("maintainerOrgId" = public.current_maintainer_org_id()) WITH CHECK ("maintainerOrgId" = public.current_maintainer_org_id())',
        table_name || '_maintainer_org_isolation', table_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public."User"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "User_maintainerOrgId_idx" ON "User" ("maintainerOrgId");
  END IF;
  IF to_regclass('public."Registration"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "Registration_maintainerOrgId_idx" ON "Registration" ("maintainerOrgId");
  END IF;
  IF to_regclass('public."QueueJob"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "QueueJob_maintainerOrgId_idx" ON "QueueJob" ("maintainerOrgId");
  END IF;
END $$;