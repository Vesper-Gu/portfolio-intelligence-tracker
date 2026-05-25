ALTER TABLE "ingest_items" ADD COLUMN "extracted_ticker" varchar(40);
ALTER TABLE "ingest_items" ADD COLUMN "extracted_action" varchar(40);
ALTER TABLE "ingest_items" ADD COLUMN "extracted_confidence" varchar(24);
ALTER TABLE "ingest_items" ADD COLUMN "extraction_summary" text;
ALTER TABLE "ingest_items" ADD COLUMN "extracted_at" varchar(40);
