import { index, pgEnum, pgTable, integer, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const ingestKindEnum = pgEnum("ingest_kind", ["link", "text", "screenshot", "filing"]);
export const ingestStatusEnum = pgEnum("ingest_status", ["可接受", "需人工确认", "待复核", "已接受", "已驳回", "已修改", "已存档"]);
export const extractionProviderEnum = pgEnum("extraction_provider", ["rule_v1", "deepseek_text", "ocr_stub", "vision_llm"]);
export const capabilityNameEnum = pgEnum("capability_name", ["rag_query", "extract_signal", "image_upload"]);
export const capabilityStatusEnum = pgEnum("capability_status", ["success", "error"]);

export const sourcesTable = pgTable("sources", {
  userId: varchar("user_id", { length: 120 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  platform: varchar("platform", { length: 80 }).notNull(),
  type: varchar("type", { length: 80 }).notNull(),
  status: varchar("status", { length: 80 }).notNull(),
  lastSync: varchar("last_sync", { length: 80 }).notNull(),
  records: integer("records").notNull().default(0),
  parser: varchar("parser", { length: 160 }).notNull(),
  tags: text("tags").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.userId, table.name] }),
  index("sources_user_id_idx").on(table.userId)
]);

export const ingestItemsTable = pgTable("ingest_items", {
  id: varchar("id", { length: 40 }).primaryKey(),
  userId: varchar("user_id", { length: 120 }).notNull(),
  source: text("source").notNull(),
  sourceName: varchar("source_name", { length: 160 }),
  sourceType: varchar("source_type", { length: 40 }),
  publishedAt: varchar("published_at", { length: 40 }),
  reportingPeriod: varchar("reporting_period", { length: 40 }),
  kind: ingestKindEnum("kind").notNull(),
  ticker: varchar("ticker", { length: 40 }).notNull(),
  confidence: varchar("confidence", { length: 24 }).notNull(),
  status: ingestStatusEnum("status").notNull(),
  rawText: text("raw_text").notNull(),
  storageObjectKey: text("storage_object_key"),
  fileName: text("file_name"),
  mimeType: varchar("mime_type", { length: 120 }),
  fileSize: integer("file_size"),
  extractedTicker: varchar("extracted_ticker", { length: 40 }),
  extractedAction: varchar("extracted_action", { length: 40 }),
  extractedConfidence: varchar("extracted_confidence", { length: 24 }),
  extractionSummary: text("extraction_summary"),
  extractedAt: varchar("extracted_at", { length: 40 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("ingest_items_user_id_idx").on(table.userId)]);

export const extractionCandidatesTable = pgTable("extraction_candidates", {
  id: varchar("id", { length: 60 }).primaryKey(),
  userId: varchar("user_id", { length: 120 }).notNull(),
  ingestItemId: varchar("ingest_item_id", { length: 40 }).notNull(),
  provider: extractionProviderEnum("provider").notNull(),
  ticker: varchar("ticker", { length: 40 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  confidence: varchar("confidence", { length: 24 }).notNull(),
  summary: text("summary").notNull(),
  status: varchar("status", { length: 40 }),
  fallbackUsed: integer("fallback_used"),
  retryable: integer("retryable"),
  providerError: varchar("provider_error", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("extraction_candidates_user_id_idx").on(table.userId)]);

export const holdingsTable = pgTable("holdings", {
  id: varchar("id", { length: 60 }).primaryKey(),
  userId: varchar("user_id", { length: 120 }).notNull(),
  ticker: varchar("ticker", { length: 40 }).notNull(),
  source: text("source").notNull(),
  sourceName: varchar("source_name", { length: 160 }),
  sourceType: varchar("source_type", { length: 40 }),
  publishedAt: varchar("published_at", { length: 40 }),
  reportingPeriod: varchar("reporting_period", { length: 40 }),
  sourceIngestItemId: varchar("source_ingest_item_id", { length: 40 }).notNull(),
  lastAction: varchar("last_action", { length: 40 }).notNull(),
  confidence: varchar("confidence", { length: 24 }).notNull(),
  status: varchar("status", { length: 40 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("holdings_user_id_idx").on(table.userId)]);

export const holdingEventsTable = pgTable("holding_events", {
  id: varchar("id", { length: 60 }).primaryKey(),
  userId: varchar("user_id", { length: 120 }).notNull(),
  holdingId: varchar("holding_id", { length: 60 }).notNull(),
  ingestItemId: varchar("ingest_item_id", { length: 40 }).notNull(),
  ticker: varchar("ticker", { length: 40 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  confidence: varchar("confidence", { length: 24 }).notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("holding_events_user_id_idx").on(table.userId)]);

export const qualityEventsTable = pgTable("quality_events", {
  id: varchar("id", { length: 60 }).primaryKey(),
  userId: varchar("user_id", { length: 120 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 160 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  severity: varchar("severity", { length: 40 }).notNull(),
  summary: text("summary").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("quality_events_user_id_idx").on(table.userId)]);

export const capabilityTracesTable = pgTable("capability_traces", {
  id: varchar("id", { length: 60 }).primaryKey(),
  userId: varchar("user_id", { length: 120 }).notNull(),
  capability: capabilityNameEnum("capability").notNull(),
  status: capabilityStatusEnum("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  skillName: varchar("skill_name", { length: 80 }),
  skillVersion: varchar("skill_version", { length: 40 }),
  provider: varchar("provider", { length: 80 }),
  model: varchar("model", { length: 120 }),
  promptVersion: varchar("prompt_version", { length: 40 }),
  attemptCount: integer("attempt_count"),
  inputUnits: integer("input_units"),
  outputUnits: integer("output_units"),
  estimatedCostMicrousd: integer("estimated_cost_microusd"),
  fallbackUsed: integer("fallback_used"),
  inputSummary: varchar("input_summary", { length: 240 }),
  outputSummary: varchar("output_summary", { length: 240 }),
  errorCode: varchar("error_code", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("capability_traces_user_id_idx").on(table.userId)]);

export const dailyCapabilityUsageTable = pgTable("daily_capability_usage", {
  userId: varchar("user_id", { length: 120 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  ragQueries: integer("rag_queries").notNull().default(0),
  extractionRequests: integer("extraction_requests").notNull().default(0),
  imageUploads: integer("image_uploads").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.userId, table.day] }),
  index("daily_capability_usage_user_id_idx").on(table.userId)
]);

export type SourceRow = typeof sourcesTable.$inferSelect;
export type IngestItemRow = typeof ingestItemsTable.$inferSelect;
export type ExtractionCandidateRow = typeof extractionCandidatesTable.$inferSelect;
export type HoldingRecordRow = typeof holdingsTable.$inferSelect;
export type HoldingEventRow = typeof holdingEventsTable.$inferSelect;
export type QualityEventRow = typeof qualityEventsTable.$inferSelect;
export type CapabilityTraceRow = typeof capabilityTracesTable.$inferSelect;
export type DailyCapabilityUsageRow = typeof dailyCapabilityUsageTable.$inferSelect;
