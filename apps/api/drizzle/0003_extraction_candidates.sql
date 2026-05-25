CREATE TYPE "extraction_provider" AS ENUM ('rule_v1', 'ocr_stub', 'vision_llm');

CREATE TABLE "extraction_candidates" (
  "id" varchar(60) PRIMARY KEY NOT NULL,
  "ingest_item_id" varchar(40) NOT NULL,
  "provider" "extraction_provider" NOT NULL,
  "ticker" varchar(40) NOT NULL,
  "action" varchar(40) NOT NULL,
  "confidence" varchar(24) NOT NULL,
  "summary" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
