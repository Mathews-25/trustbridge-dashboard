CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "User_githubUsername_trgm_idx"
ON "User" USING gin ("githubUsername" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Registration_stellarAddress_trgm_idx"
ON "Registration" USING gin ("stellarAddress" gin_trgm_ops);
