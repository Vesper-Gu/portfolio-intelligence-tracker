import { z } from "zod";

export const toneSchema = z.enum(["positive", "negative", "warning", "neutral", "empty"]);
export const signalActionSchema = z.enum(["加仓", "持有", "减仓", "新建仓", "风险", "观察"]);
export const viewKeySchema = z.enum(["dashboard", "distribution", "ingest", "library", "rag", "settings", "sources"]);
export const ingestStatusSchema = z.enum(["可接受", "需人工确认", "待复核", "已接受", "已驳回", "已修改"]);
export const ingestKindSchema = z.enum(["link", "text", "screenshot", "filing"]);
export const researchSourceTypeSchema = z.enum(["kol_post", "fund_filing", "research_article", "personal_note", "screenshot", "other"]);
export const extractionProviderSchema = z.enum(["rule_v1", "deepseek_text", "ocr_stub", "vision_llm"]);
export const extractionStatusSchema = z.enum(["success", "fallback", "error"]);
export const capabilityNameSchema = z.enum(["rag_query", "extract_signal", "image_upload"]);
export const capabilityStatusSchema = z.enum(["success", "error"]);
export const skillNameSchema = z.enum([
  "extract_text_signal",
  "extract_image_signal",
  "retrieve_evidence",
  "generate_grounded_answer",
  "validate_grounding"
]);

export const tickerMoveSchema = z.object({
  symbol: z.string(),
  change: z.string(),
  tone: toneSchema
});

export const holdingSignalSchema = z.object({
  ticker: z.string(),
  action: signalActionSchema,
  kolCount: z.number().int().nonnegative(),
  delta: z.string(),
  avgWeight: z.string(),
  source: z.string(),
  evidence: z.string(),
  verified: z.string(),
  tone: toneSchema
});

export const evidenceItemSchema = z.object({
  label: z.string(),
  source: z.string(),
  detail: z.string(),
  tone: toneSchema
});

export const heatmapRowSchema = z.object({
  label: z.string(),
  cells: z.array(toneSchema)
});

export const ingestItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceName: z.string().optional(),
  sourceType: researchSourceTypeSchema.optional(),
  publishedAt: z.string().optional(),
  reportingPeriod: z.string().optional(),
  kind: ingestKindSchema,
  ticker: z.string(),
  confidence: z.string(),
  status: ingestStatusSchema,
  rawText: z.string(),
  storageObjectKey: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  extractedTicker: z.string().optional(),
  extractedAction: signalActionSchema.optional(),
  extractedConfidence: z.string().optional(),
  extractionSummary: z.string().optional(),
  extractedAt: z.string().optional()
});

export const extractionCandidateSchema = z.object({
  id: z.string(),
  ingestItemId: z.string(),
  provider: extractionProviderSchema,
  ticker: z.string(),
  action: signalActionSchema,
  confidence: z.string(),
  summary: z.string(),
  status: extractionStatusSchema.optional(),
  fallbackUsed: z.boolean().optional(),
  retryable: z.boolean().optional(),
  providerError: z.string().optional(),
  createdAt: z.string()
});

export const holdingRecordSchema = z.object({
  id: z.string(),
  ticker: z.string(),
  source: z.string(),
  sourceName: z.string().optional(),
  sourceType: researchSourceTypeSchema.optional(),
  publishedAt: z.string().optional(),
  reportingPeriod: z.string().optional(),
  sourceIngestItemId: z.string(),
  lastAction: signalActionSchema,
  confidence: z.string(),
  status: z.enum(["已确认", "已归档"]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const holdingEventSchema = z.object({
  id: z.string(),
  holdingId: z.string(),
  ingestItemId: z.string(),
  ticker: z.string(),
  action: signalActionSchema,
  confidence: z.string(),
  summary: z.string(),
  createdAt: z.string()
});

export const portfolioPositionSchema = z.object({
  ticker: z.string(),
  status: z.enum(["活跃", "已归档"]),
  holdingsCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  avgConfidence: z.string(),
  latestAction: signalActionSchema,
  netStance: z.enum(["看多", "中性", "看空"]),
  netScore: z.number().int(),
  bullishEvents: z.number().int().nonnegative(),
  bearishEvents: z.number().int().nonnegative(),
  neutralEvents: z.number().int().nonnegative(),
  sources: z.array(z.string()),
  lastUpdated: z.string()
});

export const createExtractionCandidateRequestSchema = extractionCandidateSchema.omit({
  id: true,
  createdAt: true
});

export const updateExtractionCandidateRequestSchema = z.object({
  ticker: z.string().min(1).optional(),
  action: signalActionSchema.optional(),
  confidence: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  status: extractionStatusSchema.optional(),
  fallbackUsed: z.boolean().optional(),
  retryable: z.boolean().optional(),
  providerError: z.string().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided"
});

export const createIngestItemRequestSchema = z.object({
  source: z.string().min(1),
  sourceName: z.string().min(1).optional(),
  sourceType: researchSourceTypeSchema.optional(),
  publishedAt: z.string().min(1).optional(),
  reportingPeriod: z.string().min(1).optional(),
  kind: ingestKindSchema.exclude(["filing"]),
  ticker: z.string().min(1).optional(),
  confidence: z.string().min(1).optional(),
  rawText: z.string().min(1),
  storageObjectKey: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  extractedTicker: z.string().min(1).optional(),
  extractedAction: signalActionSchema.optional(),
  extractedConfidence: z.string().min(1).optional(),
  extractionSummary: z.string().min(1).optional(),
  extractedAt: z.string().min(1).optional()
});

export const acceptIngestItemRequestSchema = z.object({
  reviewer: z.string().min(1).optional(),
  notes: z.string().optional()
});

export const rejectIngestItemRequestSchema = z.object({
  reviewer: z.string().min(1).optional(),
  reason: z.string().min(1)
});

export const updateIngestItemRequestSchema = z.object({
  source: z.string().min(1).optional(),
  sourceName: z.string().min(1).optional(),
  sourceType: researchSourceTypeSchema.optional(),
  publishedAt: z.string().min(1).optional(),
  reportingPeriod: z.string().min(1).optional(),
  kind: ingestKindSchema.optional(),
  ticker: z.string().min(1).optional(),
  confidence: z.string().min(1).optional(),
  status: ingestStatusSchema.optional(),
  rawText: z.string().min(1).optional(),
  storageObjectKey: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  extractedTicker: z.string().min(1).optional(),
  extractedAction: signalActionSchema.optional(),
  extractedConfidence: z.string().min(1).optional(),
  extractionSummary: z.string().min(1).optional(),
  extractedAt: z.string().min(1).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided"
});

export const sourceItemSchema = z.object({
  name: z.string(),
  platform: z.string(),
  type: z.string(),
  status: z.string(),
  lastSync: z.string(),
  records: z.number().int().nonnegative(),
  parser: z.string()
});

export const updateSourceRequestSchema = z.object({
  status: z.string().min(1).optional(),
  parser: z.string().min(1).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided"
});

export const qualitySummarySchema = z.object({
  pendingReview: z.number().int().nonnegative(),
  lowConfidenceFields: z.number().int().nonnegative(),
  verifiedToday: z.number().int().nonnegative(),
  lastUpdated: z.string()
});

export const qualityEventSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  eventType: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  summary: z.string(),
  metadata: z.string().optional(),
  createdAt: z.string()
});

export const capabilityTraceSchema = z.object({
  id: z.string(),
  capability: capabilityNameSchema,
  status: capabilityStatusSchema,
  durationMs: z.number().int().nonnegative(),
  skillName: skillNameSchema.optional(),
  skillVersion: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  attemptCount: z.number().int().positive().optional(),
  inputUnits: z.number().int().nonnegative().optional(),
  outputUnits: z.number().int().nonnegative().optional(),
  estimatedCostMicrousd: z.number().int().nonnegative().optional(),
  fallbackUsed: z.boolean().optional(),
  inputSummary: z.string().optional(),
  outputSummary: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string()
});

export const dailyCapabilityUsageSchema = z.object({
  day: z.string(),
  ragQueries: z.number().int().nonnegative(),
  extractionRequests: z.number().int().nonnegative(),
  imageUploads: z.number().int().nonnegative()
});

export const ragQueryRequestSchema = z.object({
  query: z.string().min(1),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1)
  })).max(12).optional(),
  limit: z.number().int().positive().max(12).optional()
});

export const ragCitationSchema = z.object({
  id: z.string(),
  entityType: z.enum(["position", "holding", "holding_event", "ingest_item", "extraction_candidate"]),
  entityId: z.string(),
  sourceIngestItemId: z.string().optional(),
  title: z.string(),
  snippet: z.string(),
  score: z.number().nonnegative()
});

export const ragQueryResponseSchema = z.object({
  query: z.string(),
  answer: z.string(),
  answerMode: z.enum(["llm", "template"]).optional(),
  citations: z.array(ragCitationSchema),
  generatedAt: z.string()
});

export const accountExportSchema = z.object({
  exportedAt: z.string(),
  userScope: z.string(),
  ingestItems: z.array(ingestItemSchema),
  extractionCandidates: z.array(extractionCandidateSchema),
  holdings: z.array(holdingRecordSchema),
  holdingEvents: z.array(holdingEventSchema),
  qualityEvents: z.array(qualityEventSchema),
  capabilityTraces: z.array(capabilityTraceSchema)
});

export const accountDeleteResponseSchema = z.object({
  deletedAt: z.string(),
  userScope: z.string(),
  deleted: z.object({
    ingestItems: z.number().int().nonnegative(),
    extractionCandidates: z.number().int().nonnegative(),
    holdings: z.number().int().nonnegative(),
    holdingEvents: z.number().int().nonnegative(),
    qualityEvents: z.number().int().nonnegative(),
    capabilityTraces: z.number().int().nonnegative()
  })
});

export const opsStatusSchema = z.object({
  generatedAt: z.string(),
  userScope: z.string(),
  repositoryMode: z.string(),
  auth: z.object({
    mode: z.enum(["local-dev", "demo", "external"]),
    userScoped: z.boolean(),
    currentUserId: z.string()
  }),
  providers: z.object({
    textExtraction: z.object({
      configured: z.boolean(),
      provider: z.string()
    }),
    vision: z.object({
      configured: z.boolean(),
      provider: z.string()
    }),
    ragLlm: z.object({
      configured: z.boolean(),
      provider: z.string(),
      model: z.string()
    }),
    ragVectorRetrieval: z.object({
      configured: z.boolean(),
      provider: z.string(),
      model: z.string()
    }),
    storage: z.object({
      configured: z.boolean(),
      bucket: z.string()
    })
  }),
  costControls: z.object({
    dailyVisionLimit: z.number().int().nonnegative(),
    dailyLlmLimit: z.number().int().nonnegative(),
    maxUploadMb: z.number().int().positive(),
    imagePreviewExpiresInSeconds: z.number().int().positive()
  }),
  sessionUsage: dailyCapabilityUsageSchema.omit({ day: true }),
  privacy: z.object({
    uploadStoresOriginalImage: z.boolean(),
    signedImagePreviewOnly: z.boolean(),
    llmReceivesRetrievedContext: z.boolean(),
    externalFactsAllowed: z.boolean()
  })
});

export const dashboardPayloadSchema = z.object({
  tickerMoves: z.array(tickerMoveSchema),
  holdingSignals: z.array(holdingSignalSchema),
  evidenceItems: z.array(evidenceItemSchema),
  heatmapColumns: z.array(z.string()),
  heatmapRows: z.array(heatmapRowSchema),
  qualitySummary: qualitySummarySchema
});

export type Tone = z.infer<typeof toneSchema>;
export type SignalAction = z.infer<typeof signalActionSchema>;
export type ViewKey = z.infer<typeof viewKeySchema>;
export type IngestStatus = z.infer<typeof ingestStatusSchema>;
export type IngestKind = z.infer<typeof ingestKindSchema>;
export type ResearchSourceType = z.infer<typeof researchSourceTypeSchema>;
export type ExtractionProvider = z.infer<typeof extractionProviderSchema>;
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;
export type CapabilityName = z.infer<typeof capabilityNameSchema>;
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;
export type SkillName = z.infer<typeof skillNameSchema>;
export type TickerMove = z.infer<typeof tickerMoveSchema>;
export type HoldingSignal = z.infer<typeof holdingSignalSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type HeatmapRow = z.infer<typeof heatmapRowSchema>;
export type IngestItem = z.infer<typeof ingestItemSchema>;
export type ExtractionCandidate = z.infer<typeof extractionCandidateSchema>;
export type HoldingRecord = z.infer<typeof holdingRecordSchema>;
export type HoldingEvent = z.infer<typeof holdingEventSchema>;
export type PortfolioPosition = z.infer<typeof portfolioPositionSchema>;
export type CreateIngestItemRequest = z.infer<typeof createIngestItemRequestSchema>;
export type CreateExtractionCandidateRequest = z.infer<typeof createExtractionCandidateRequestSchema>;
export type UpdateExtractionCandidateRequest = z.infer<typeof updateExtractionCandidateRequestSchema>;
export type AcceptIngestItemRequest = z.infer<typeof acceptIngestItemRequestSchema>;
export type RejectIngestItemRequest = z.infer<typeof rejectIngestItemRequestSchema>;
export type UpdateIngestItemRequest = z.infer<typeof updateIngestItemRequestSchema>;
export type SourceItem = z.infer<typeof sourceItemSchema>;
export type UpdateSourceRequest = z.infer<typeof updateSourceRequestSchema>;
export type QualitySummary = z.infer<typeof qualitySummarySchema>;
export type QualityEvent = z.infer<typeof qualityEventSchema>;
export type CapabilityTrace = z.infer<typeof capabilityTraceSchema>;
export type DailyCapabilityUsage = z.infer<typeof dailyCapabilityUsageSchema>;
export type RagQueryRequest = z.infer<typeof ragQueryRequestSchema>;
export type RagCitation = z.infer<typeof ragCitationSchema>;
export type RagQueryResponse = z.infer<typeof ragQueryResponseSchema>;
export type AccountExport = z.infer<typeof accountExportSchema>;
export type AccountDeleteResponse = z.infer<typeof accountDeleteResponseSchema>;
export type OpsStatus = z.infer<typeof opsStatusSchema>;
export type DashboardPayload = z.infer<typeof dashboardPayloadSchema>;
