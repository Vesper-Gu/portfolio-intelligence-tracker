ALTER TABLE "ingest_items" ADD COLUMN "storage_object_key" text;
ALTER TABLE "ingest_items" ADD COLUMN "file_name" text;
ALTER TABLE "ingest_items" ADD COLUMN "mime_type" varchar(120);
ALTER TABLE "ingest_items" ADD COLUMN "file_size" integer;
