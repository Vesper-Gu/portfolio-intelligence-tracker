import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import {
  acceptIngestItemRequestSchema,
  accountDeleteResponseSchema,
  accountExportSchema,
  createIngestItemRequestSchema,
  dashboardPayloadSchema,
  extractionCandidateSchema,
  holdingEventSchema,
  holdingRecordSchema,
  ingestItemSchema,
  portfolioPositionSchema,
  qualityEventSchema,
  qualitySummarySchema,
  opsStatusSchema,
  ragQueryRequestSchema,
  ragQueryResponseSchema,
  rejectIngestItemRequestSchema,
  sourceItemSchema,
  updateSourceRequestSchema,
  updateIngestItemRequestSchema
} from "@pit/shared";
import { createExtractionProviderFromEnv, type ExtractionProvider } from "./extraction/provider.js";
import { createAuthConfiguration, type AuthMode, type AuthVerifier } from "./auth.js";
import type { RagAnswerGenerator } from "./rag/llm.js";
import { answerRagQuery } from "./rag/query.js";
import { createMockRepository, type PortfolioRepository } from "./repository.js";
import type { IngestImageUploader } from "./storage/supabaseStorage.js";

const ingestItemParamsSchema = ingestItemSchema.pick({ id: true });
const holdingParamsSchema = holdingRecordSchema.pick({ id: true });
const sourceParamsSchema = sourceItemSchema.pick({ name: true });
const allowedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "20");
const imagePreviewExpiresInSeconds = Number(process.env.IMAGE_PREVIEW_EXPIRES_IN_SECONDS ?? "300");
const dailyVisionLimit = Number(process.env.DAILY_VISION_LIMIT ?? "50");
const dailyLlmLimit = Number(process.env.DAILY_LLM_LIMIT ?? "200");

export interface BuildAppOptions {
  repository?: PortfolioRepository;
  corsOrigin?: string;
  imageUploader?: IngestImageUploader;
  extractionProvider?: ExtractionProvider;
  ragAnswerGenerator?: RagAnswerGenerator;
  authVerifier?: AuthVerifier;
  authMode?: AuthMode;
}

export function buildApp(options: BuildAppOptions = {}) {
  const repository = options.repository ?? createMockRepository();
  const extractionProvider = options.extractionProvider ?? createExtractionProviderFromEnv(process.env);
  const auth = options.authVerifier
    ? { mode: options.authMode ?? "external", verifier: options.authVerifier }
    : createAuthConfiguration(process.env);
  const dailyUsageByUser = new Map<string, {
    day: string;
    ragQueries: number;
    extractionRequests: number;
    imageUploads: number;
  }>();
  function usageFor(userId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const current = dailyUsageByUser.get(userId);

    if (current?.day === day) return current;

    const next = { day, ragQueries: 0, extractionRequests: 0, imageUploads: 0 };
    dailyUsageByUser.set(userId, next);
    return next;
  }
  const app = Fastify({
    logger: process.env.LOG_LEVEL ? { level: process.env.LOG_LEVEL } : false
  });

  void app.register(cors, {
    origin: options.corsOrigin ?? "http://127.0.0.1:5173"
  });
  void app.register(multipart, {
    limits: {
      fileSize: maxUploadMb * 1024 * 1024,
      files: 1
    }
  });

  app.decorateRequest("userId", "");
  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") return;

    try {
      request.userId = await auth.verifier(request.headers.authorization);
    } catch {
      return reply.code(401).send({ error: "Authentication required" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "portfolio-intelligence-tracker-api"
  }));

  app.get("/ops/status", async (request) => opsStatusSchema.parse({
    generatedAt: new Date().toISOString(),
    userScope: request.userId,
    repositoryMode: process.env.DATA_REPOSITORY ?? "mock",
    auth: {
      mode: auth.mode,
      userScoped: true,
      currentUserId: request.userId
    },
    providers: {
      textExtraction: {
        configured: Boolean(process.env.DEEPSEEK_API_KEY),
        provider: process.env.DEEPSEEK_API_KEY ? "deepseek_text" : "rule_v1"
      },
      vision: {
        configured: process.env.VISION_PROVIDER === "kimi" && Boolean(process.env.MOONSHOT_API_KEY),
        provider: process.env.VISION_PROVIDER || "disabled"
      },
      ragLlm: {
        configured: Boolean(process.env.RAG_LLM_API_KEY || process.env.DEEPSEEK_API_KEY),
        provider: process.env.RAG_LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        model: process.env.RAG_LLM_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
      },
      storage: {
        configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET),
        bucket: process.env.SUPABASE_STORAGE_BUCKET || "not-configured"
      }
    },
    costControls: {
      dailyVisionLimit,
      dailyLlmLimit,
      maxUploadMb,
      imagePreviewExpiresInSeconds
    },
    sessionUsage: usageFor(request.userId),
    privacy: {
      uploadStoresOriginalImage: Boolean(options.imageUploader),
      signedImagePreviewOnly: true,
      llmReceivesRetrievedContext: true,
      externalFactsAllowed: false
    }
  }));

  app.get("/account/export", async (request) => (
    accountExportSchema.parse(await repository.exportAccountData(request.userId))
  ));

  app.delete("/account/data", async (request, reply) => {
    const snapshot = await repository.exportAccountData(request.userId);
    const objectKeys = snapshot.ingestItems.flatMap((item) => item.storageObjectKey ? [item.storageObjectKey] : []);

    if (options.imageUploader && objectKeys.length) {
      const results = await Promise.allSettled(objectKeys.map((objectKey) => options.imageUploader!.deleteImage(objectKey)));

      if (results.some((result) => result.status === "rejected")) {
        return reply.code(502).send({ error: "Stored image deletion failed; account data has not been deleted" });
      }
    }

    const result = accountDeleteResponseSchema.parse(await repository.deleteAccountData(request.userId));
    request.log.info({ event: "account_data_deleted", userId: request.userId, deleted: result.deleted }, "Account data deleted");
    return result;
  });

  app.get("/dashboard", async (request) => dashboardPayloadSchema.parse(await repository.getDashboard(request.userId)));

  app.get("/signals", async (request) => dashboardPayloadSchema.shape.holdingSignals.parse((await repository.getDashboard(request.userId)).holdingSignals));

  app.get("/holdings", async (request) => holdingRecordSchema.array().parse(await repository.getHoldings(request.userId)));

  app.get("/portfolio/positions", async (request) => (
    portfolioPositionSchema.array().parse(await repository.getPortfolioPositions(request.userId))
  ));

  app.post("/holdings/:id/archive", async (request, reply) => {
    const { id } = holdingParamsSchema.parse(request.params);
    const holding = await repository.archiveHolding(request.userId, id);

    if (!holding) {
      return reply.code(404).send({ error: "Holding not found" });
    }

    return holdingRecordSchema.parse(holding);
  });

  app.post("/holdings/:id/restore", async (request, reply) => {
    const { id } = holdingParamsSchema.parse(request.params);
    const holding = await repository.restoreHolding(request.userId, id);

    if (!holding) {
      return reply.code(404).send({ error: "Holding not found" });
    }

    return holdingRecordSchema.parse(holding);
  });

  app.get("/holding-events", async (request) => holdingEventSchema.array().parse(await repository.getHoldingEvents(request.userId)));

  app.post("/rag/query", async (request, reply) => {
    const usage = usageFor(request.userId);
    if (usage.ragQueries >= dailyLlmLimit) {
      return reply.code(429).send({ error: "Daily RAG LLM limit reached" });
    }
    usage.ragQueries += 1;

    const body = ragQueryRequestSchema.parse(request.body);
    const response = await answerRagQuery(
      repository,
      request.userId,
      body.query,
      body.limit,
      options.ragAnswerGenerator,
      body.conversationHistory
    );

    request.log.info({ event: "rag_query_completed", userId: request.userId, answerMode: response.answerMode, citations: response.citations.length }, "RAG query completed");
    return ragQueryResponseSchema.parse(response);
  });

  app.get("/ingest-items", async (request) => ingestItemSchema.array().parse(await repository.getIngestItems(request.userId)));

  app.get("/ingest-items/:id", async (request, reply) => {
    const { id } = ingestItemParamsSchema.parse(request.params);
    const items = await repository.getIngestItems(request.userId);
    const item = items.find((candidate) => candidate.id === id);

    if (!item) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    return ingestItemSchema.parse(item);
  });

  app.post("/ingest-items", async (request, reply) => {
    const body = createIngestItemRequestSchema.parse(request.body);
    const item = await repository.createIngestItem(request.userId, body);

    return reply.code(201).send(ingestItemSchema.parse(item));
  });

  app.post("/ingest-items/upload-image", async (request, reply) => {
    if (!options.imageUploader) {
      return reply.code(503).send({ error: "Image storage is not configured" });
    }

    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ error: "Image file is required" });
    }

    if (!allowedImageMimeTypes.has(file.mimetype)) {
      return reply.code(415).send({ error: "Only png, jpeg and webp images are supported" });
    }

    const chunks: Buffer[] = [];

    for await (const chunk of file.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return reply.code(400).send({ error: "Image file is empty" });
    }

    const upload = await options.imageUploader.uploadImage(request.userId, {
      buffer,
      fileName: file.filename,
      mimeType: file.mimetype
    });
    usageFor(request.userId).imageUploads += 1;
    const item = await repository.createIngestItem(request.userId, {
      source: `storage://${upload.bucket}/${upload.objectKey}`,
      kind: "screenshot",
      ticker: "UNKNOWN",
      confidence: "0.00",
      rawText: `Image uploaded: ${file.filename} (${file.mimetype}, ${buffer.length} bytes)\nStorage object: ${upload.objectKey}`,
      storageObjectKey: upload.objectKey,
      fileName: file.filename,
      mimeType: file.mimetype,
      fileSize: buffer.length
    });

    request.log.info({ event: "ingest_image_uploaded", userId: request.userId, ingestItemId: item.id, bytes: buffer.length }, "Ingest image uploaded");
    return reply.code(201).send(ingestItemSchema.parse(item));
  });

  app.post("/ingest-items/:id/accept", async (request, reply) => {
    const { id } = ingestItemParamsSchema.parse(request.params);
    const body = acceptIngestItemRequestSchema.parse(request.body ?? {});
    const item = await repository.acceptIngestItem(request.userId, id, body);

    if (!item) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    return ingestItemSchema.parse(item);
  });

  app.post("/ingest-items/:id/reject", async (request, reply) => {
    const { id } = ingestItemParamsSchema.parse(request.params);
    const body = rejectIngestItemRequestSchema.parse(request.body);
    const item = await repository.rejectIngestItem(request.userId, id, body);

    if (!item) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    return ingestItemSchema.parse(item);
  });

  app.post("/ingest-items/:id/extract", async (request, reply) => {
    const usage = usageFor(request.userId);
    if (usage.extractionRequests >= dailyVisionLimit) {
      return reply.code(429).send({ error: "Daily extraction limit reached" });
    }
    usage.extractionRequests += 1;

    const { id } = ingestItemParamsSchema.parse(request.params);
    const items = await repository.getIngestItems(request.userId);
    const currentItem = items.find((item) => item.id === id);

    if (!currentItem) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    const candidate = await extractionProvider.extract(currentItem);
    const status = Number(candidate.confidence) >= 0.8 ? "可接受" : "需人工确认";
    const createdAt = new Date().toISOString();
    await repository.createExtractionCandidate(request.userId, {
      ingestItemId: id,
      provider: candidate.provider,
      ticker: candidate.ticker,
      action: candidate.action,
      confidence: candidate.confidence,
      summary: candidate.summary,
      status: candidate.status,
      fallbackUsed: candidate.fallbackUsed,
      retryable: candidate.retryable,
      providerError: candidate.providerError
    });
    const item = await repository.updateIngestItem(request.userId, id, {
      ticker: candidate.ticker,
      confidence: candidate.confidence,
      status,
      extractedTicker: candidate.ticker,
      extractedAction: candidate.action,
      extractedConfidence: candidate.confidence,
      extractionSummary: candidate.summary,
      extractedAt: createdAt
    });

    request.log.info({ event: "ingest_extraction_completed", userId: request.userId, ingestItemId: id, provider: candidate.provider, status: candidate.status }, "Ingest extraction completed");
    return ingestItemSchema.parse(item);
  });

  app.get("/ingest-items/:id/extraction-candidates", async (request, reply) => {
    const { id } = ingestItemParamsSchema.parse(request.params);
    const items = await repository.getIngestItems(request.userId);
    const currentItem = items.find((item) => item.id === id);

    if (!currentItem) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    const candidates = await repository.getExtractionCandidates(request.userId, id);

    return extractionCandidateSchema.array().parse(candidates);
  });

  app.get("/ingest-items/:id/image-url", async (request, reply) => {
    if (!options.imageUploader) {
      return reply.code(503).send({ error: "Image storage is not configured" });
    }

    const { id } = ingestItemParamsSchema.parse(request.params);
    const items = await repository.getIngestItems(request.userId);
    const currentItem = items.find((item) => item.id === id);

    if (!currentItem) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    if (currentItem.kind !== "screenshot" || !currentItem.storageObjectKey) {
      return reply.code(400).send({ error: "Ingest item does not have a stored image" });
    }

    const signedUrl = await options.imageUploader.createSignedUrl(currentItem.storageObjectKey, imagePreviewExpiresInSeconds);

    return {
      url: signedUrl,
      expiresInSeconds: imagePreviewExpiresInSeconds
    };
  });

  app.patch("/ingest-items/:id", async (request, reply) => {
    const { id } = ingestItemParamsSchema.parse(request.params);
    const body = updateIngestItemRequestSchema.parse(request.body);
    const item = await repository.updateIngestItem(request.userId, id, body);

    if (!item) {
      return reply.code(404).send({ error: "Ingest item not found" });
    }

    return ingestItemSchema.parse(item);
  });

  app.get("/sources", async (request) => sourceItemSchema.array().parse(await repository.getSources(request.userId)));

  app.patch("/sources/:name", async (request, reply) => {
    const { name } = sourceParamsSchema.parse(request.params);
    const body = updateSourceRequestSchema.parse(request.body);
    const source = await repository.updateSource(request.userId, name, body);

    if (!source) {
      return reply.code(404).send({ error: "Source not found" });
    }

    return sourceItemSchema.parse(source);
  });

  app.get("/quality-summary", async (request) => qualitySummarySchema.parse(await repository.getQualitySummary(request.userId)));

  app.get("/quality-events", async (request) => {
    const query = request.query as { entityId?: string };

    return qualityEventSchema.array().parse(await repository.getQualityEvents(request.userId, query.entityId));
  });

  return app;
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}
