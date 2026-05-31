CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "rag_document_embeddings" (
  "user_id" varchar(120) NOT NULL,
  "document_id" varchar(180) NOT NULL,
  "entity_type" varchar(80) NOT NULL,
  "entity_id" varchar(180) NOT NULL,
  "source_ingest_item_id" varchar(40),
  "ticker" varchar(40),
  "document_text" text NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "embedding_model" varchar(120) NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rag_document_embeddings_pkey" PRIMARY KEY ("user_id", "document_id")
);

CREATE INDEX "rag_document_embeddings_user_id_idx" ON "rag_document_embeddings" ("user_id");
CREATE INDEX "rag_document_embeddings_ticker_idx" ON "rag_document_embeddings" ("user_id", "ticker");

ALTER TABLE "rag_document_embeddings" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "rag_document_embeddings_owner_access" ON "rag_document_embeddings" FOR ALL USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';
  END IF;
END $$;
