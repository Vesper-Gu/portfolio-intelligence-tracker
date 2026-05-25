ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "user_id" varchar(120);
ALTER TABLE "ingest_items" ADD COLUMN IF NOT EXISTS "user_id" varchar(120);
ALTER TABLE "extraction_candidates" ADD COLUMN IF NOT EXISTS "user_id" varchar(120);
ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "user_id" varchar(120);
ALTER TABLE "holding_events" ADD COLUMN IF NOT EXISTS "user_id" varchar(120);
ALTER TABLE "quality_events" ADD COLUMN IF NOT EXISTS "user_id" varchar(120);

UPDATE "sources" SET "user_id" = 'local-dev-user' WHERE "user_id" IS NULL;
UPDATE "ingest_items" SET "user_id" = 'local-dev-user' WHERE "user_id" IS NULL;
UPDATE "extraction_candidates" SET "user_id" = 'local-dev-user' WHERE "user_id" IS NULL;
UPDATE "holdings" SET "user_id" = 'local-dev-user' WHERE "user_id" IS NULL;
UPDATE "holding_events" SET "user_id" = 'local-dev-user' WHERE "user_id" IS NULL;
UPDATE "quality_events" SET "user_id" = 'local-dev-user' WHERE "user_id" IS NULL;

ALTER TABLE "sources" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "ingest_items" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "extraction_candidates" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "holdings" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "holding_events" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "quality_events" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "sources" DROP CONSTRAINT IF EXISTS "sources_pkey";
ALTER TABLE "sources" ADD CONSTRAINT "sources_pkey" PRIMARY KEY ("user_id", "name");
CREATE INDEX IF NOT EXISTS "sources_user_id_idx" ON "sources" ("user_id");
CREATE INDEX IF NOT EXISTS "ingest_items_user_id_idx" ON "ingest_items" ("user_id");
CREATE INDEX IF NOT EXISTS "extraction_candidates_user_id_idx" ON "extraction_candidates" ("user_id");
CREATE INDEX IF NOT EXISTS "holdings_user_id_idx" ON "holdings" ("user_id");
CREATE INDEX IF NOT EXISTS "holding_events_user_id_idx" ON "holding_events" ("user_id");
CREATE INDEX IF NOT EXISTS "quality_events_user_id_idx" ON "quality_events" ("user_id");

ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingest_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "extraction_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holdings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holding_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quality_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "sources_owner_access" ON "sources" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "ingest_items_owner_access" ON "ingest_items" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "extraction_candidates_owner_access" ON "extraction_candidates" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "holdings_owner_access" ON "holdings" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "holding_events_owner_access" ON "holding_events" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "quality_events_owner_access" ON "quality_events" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
  END IF;
END $$;
