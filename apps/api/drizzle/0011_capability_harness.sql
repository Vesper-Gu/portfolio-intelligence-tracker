CREATE TYPE "capability_name" AS ENUM ('rag_query', 'extract_signal', 'image_upload');
CREATE TYPE "capability_status" AS ENUM ('success', 'error');

CREATE TABLE "capability_traces" (
  "id" varchar(60) PRIMARY KEY,
  "user_id" varchar(120) NOT NULL,
  "capability" "capability_name" NOT NULL,
  "status" "capability_status" NOT NULL,
  "duration_ms" integer NOT NULL,
  "input_summary" varchar(240),
  "output_summary" varchar(240),
  "error_code" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "daily_capability_usage" (
  "user_id" varchar(120) NOT NULL,
  "day" varchar(10) NOT NULL,
  "rag_queries" integer DEFAULT 0 NOT NULL,
  "extraction_requests" integer DEFAULT 0 NOT NULL,
  "image_uploads" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_capability_usage_pkey" PRIMARY KEY ("user_id", "day")
);

CREATE INDEX "capability_traces_user_id_idx" ON "capability_traces" ("user_id");
CREATE INDEX "daily_capability_usage_user_id_idx" ON "daily_capability_usage" ("user_id");

ALTER TABLE "capability_traces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_capability_usage" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "capability_traces_owner_access" ON "capability_traces" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "daily_capability_usage_owner_access" ON "daily_capability_usage" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
  END IF;
END $$;
