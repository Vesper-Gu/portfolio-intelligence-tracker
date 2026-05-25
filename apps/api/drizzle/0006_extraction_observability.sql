ALTER TABLE "extraction_candidates" ADD COLUMN IF NOT EXISTS "status" varchar(40);
ALTER TABLE "extraction_candidates" ADD COLUMN IF NOT EXISTS "fallback_used" integer;
ALTER TABLE "extraction_candidates" ADD COLUMN IF NOT EXISTS "retryable" integer;
ALTER TABLE "extraction_candidates" ADD COLUMN IF NOT EXISTS "provider_error" varchar(120);
