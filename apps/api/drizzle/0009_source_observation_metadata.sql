ALTER TABLE "ingest_items" ADD COLUMN IF NOT EXISTS "source_name" varchar(160);
ALTER TABLE "ingest_items" ADD COLUMN IF NOT EXISTS "source_type" varchar(40);
ALTER TABLE "ingest_items" ADD COLUMN IF NOT EXISTS "published_at" varchar(40);
ALTER TABLE "ingest_items" ADD COLUMN IF NOT EXISTS "reporting_period" varchar(40);

ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "source_name" varchar(160);
ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "source_type" varchar(40);
ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "published_at" varchar(40);
ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "reporting_period" varchar(40);
