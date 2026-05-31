import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { createPostgresClient } from "../db/connection.js";
import type { RagVectorDocument, RagVectorMatch, RagVectorRetriever } from "./retrieval.js";

interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

interface OpenAiCompatibleEmbeddingProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

interface PgvectorHybridRetrieverOptions {
  sql: Sql;
  embeddingProvider: EmbeddingProvider;
}

export function createPgvectorHybridRetrieverFromEnv(env: NodeJS.ProcessEnv): RagVectorRetriever | undefined {
  if (
    env.RAG_VECTOR_RETRIEVAL !== "true"
    || !env.DATABASE_URL
    || !env.RAG_EMBEDDING_API_KEY
  ) {
    return undefined;
  }

  return new PgvectorHybridRetriever({
    sql: createPostgresClient(env.DATABASE_URL),
    embeddingProvider: new OpenAiCompatibleEmbeddingProvider({
      apiKey: env.RAG_EMBEDDING_API_KEY,
      baseUrl: env.RAG_EMBEDDING_BASE_URL,
      model: env.RAG_EMBEDDING_MODEL
    })
  });
}

export class PgvectorHybridRetriever implements RagVectorRetriever {
  constructor(private readonly options: PgvectorHybridRetrieverOptions) {}

  async search(userId: string, query: string, documents: RagVectorDocument[], limit: number): Promise<RagVectorMatch[]> {
    if (!documents.length) return [];

    const fingerprints = new Map(documents.map((document) => [document.id, fingerprint(document)]));
    const indexedRows = await this.options.sql<{ document_id: string; fingerprint: string }[]>`
      SELECT "document_id", "fingerprint"
      FROM "rag_document_embeddings"
      WHERE "user_id" = ${userId}
        AND "document_id" = ANY(${documents.map((document) => document.id)})
    `;
    const indexed = new Map(indexedRows.map((row) => [row.document_id, row.fingerprint]));
    const changedDocuments = documents.filter((document) => indexed.get(document.id) !== fingerprints.get(document.id));
    const texts = [query, ...changedDocuments.map(documentText)];
    const [queryEmbedding, ...documentEmbeddings] = await this.options.embeddingProvider.embed(texts);

    for (const [index, document] of changedDocuments.entries()) {
      await this.upsertDocument(userId, document, fingerprints.get(document.id) ?? "", documentEmbeddings[index]);
    }

    const rows = await this.options.sql<{ document_id: string; score: number }[]>`
      SELECT
        "document_id",
        1 - ("embedding" <=> ${vectorLiteral(queryEmbedding)}::vector) AS "score"
      FROM "rag_document_embeddings"
      WHERE "user_id" = ${userId}
        AND "document_id" = ANY(${documents.map((document) => document.id)})
      ORDER BY "embedding" <=> ${vectorLiteral(queryEmbedding)}::vector
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      documentId: row.document_id,
      score: Number(row.score)
    }));
  }

  private async upsertDocument(userId: string, document: RagVectorDocument, fingerprintValue: string, embedding: number[]) {
    await this.options.sql`
      INSERT INTO "rag_document_embeddings" (
        "user_id",
        "document_id",
        "entity_type",
        "entity_id",
        "source_ingest_item_id",
        "ticker",
        "document_text",
        "fingerprint",
        "embedding_model",
        "embedding",
        "updated_at"
      ) VALUES (
        ${userId},
        ${document.id},
        ${document.entityType},
        ${document.entityId},
        ${document.sourceIngestItemId ?? null},
        ${document.ticker ?? null},
        ${documentText(document)},
        ${fingerprintValue},
        ${this.options.embeddingProvider.model},
        ${vectorLiteral(embedding)}::vector,
        now()
      )
      ON CONFLICT ("user_id", "document_id") DO UPDATE SET
        "entity_type" = EXCLUDED."entity_type",
        "entity_id" = EXCLUDED."entity_id",
        "source_ingest_item_id" = EXCLUDED."source_ingest_item_id",
        "ticker" = EXCLUDED."ticker",
        "document_text" = EXCLUDED."document_text",
        "fingerprint" = EXCLUDED."fingerprint",
        "embedding_model" = EXCLUDED."embedding_model",
        "embedding" = EXCLUDED."embedding",
        "updated_at" = now()
    `;
  }
}

class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAiCompatibleEmbeddingProviderOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "text-embedding-3-small";
  }

  async embed(texts: string[]) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding provider failed: ${response.status}`);
    }

    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embeddings = payload.data?.map((item) => item.embedding).filter((embedding): embedding is number[] => Boolean(embedding));

    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error("Embedding provider returned incomplete vectors");
    }

    return embeddings;
  }
}

function documentText(document: RagVectorDocument) {
  return `${document.title}\n${document.text}`;
}

function fingerprint(document: RagVectorDocument) {
  return createHash("sha256").update(documentText(document)).digest("hex");
}

function vectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
