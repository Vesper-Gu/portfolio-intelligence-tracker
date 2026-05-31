import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  dashboardPayload,
  extractionProviderSchema,
  qualitySummary,
  researchSourceTypeSchema,
  signalActionSchema,
  type CreateExtractionCandidateRequest,
  type CapabilityName,
  type CapabilityTrace,
  type DailyCapabilityUsage,
  type ExtractionCandidate,
  type HoldingEvent,
  type HoldingRecord,
  type IngestItem,
  type QualityEvent,
  type SourceItem
} from "@pit/shared";
import type {
  AcceptIngestItemRequest,
  CreateIngestItemRequest,
  RejectIngestItemRequest,
  UpdateSourceRequest,
  UpdateIngestItemRequest
} from "@pit/shared";
import {
  extractionCandidatesTable,
  capabilityTracesTable,
  dailyCapabilityUsageTable,
  holdingEventsTable,
  holdingsTable,
  ingestItemsTable,
  qualityEventsTable,
  sourcesTable,
  type ExtractionCandidateRow,
  type CapabilityTraceRow,
  type DailyCapabilityUsageRow,
  type HoldingEventRow,
  type HoldingRecordRow,
  type IngestItemRow,
  type QualityEventRow,
  type SourceRow
} from "../db/schema.js";
import { createDatabase } from "../db/connection.js";
import type { PortfolioRepository } from "./portfolioRepository.js";
import { buildEvidenceDashboard, buildPortfolioPositions } from "../portfolio/positions.js";

export interface DatabaseRepositoryOptions {
  databaseUrl: string;
}

export function createDatabaseRepository(options: DatabaseRepositoryOptions): PortfolioRepository {
  const db = createDatabase(options.databaseUrl);

  return new DatabasePortfolioRepository(db);
}

export class DatabasePortfolioRepository implements PortfolioRepository {
  constructor(private readonly db: PostgresJsDatabase) {}

  async getDashboard(userId: string) {
    return buildEvidenceDashboard(dashboardPayload, await this.getHoldings(userId));
  }

  async getIngestItems(userId: string) {
    const rows = await this.db.select().from(ingestItemsTable).where(eq(ingestItemsTable.userId, userId)).orderBy(desc(ingestItemsTable.createdAt));
    return rows.map(mapIngestItemRow);
  }

  async getSources(userId: string) {
    const rows = await this.db.select().from(sourcesTable).where(eq(sourcesTable.userId, userId)).orderBy(sourcesTable.name);
    return rows.map(mapSourceRow);
  }

  async updateSource(userId: string, name: string, request: UpdateSourceRequest) {
    const ownerFilter = and(eq(sourcesTable.userId, userId), eq(sourcesTable.name, name));
    const [previousRow] = await this.db.select().from(sourcesTable).where(ownerFilter).limit(1);
    const [row] = await this.db
      .update(sourcesTable)
      .set({
        ...request,
        updatedAt: new Date()
      })
      .where(ownerFilter)
      .returning();

    if (row) {
      await this.createQualityEvent(userId, {
        entityType: "source",
        entityId: name,
        eventType: "source_config_updated",
        severity: "info",
        summary: `来源配置已更新：${name}`,
        metadata: JSON.stringify({
          before: previousRow ? {
            status: previousRow.status,
            parser: previousRow.parser
          } : null,
          after: {
            status: row.status,
            parser: row.parser
          }
        })
      });
    }

    return row ? mapSourceRow(row) : undefined;
  }

  getQualitySummary(_userId: string) {
    return qualitySummary;
  }

  async getQualityEvents(userId: string, entityId?: string) {
    const rows = entityId
      ? await this.db
        .select()
        .from(qualityEventsTable)
        .where(and(eq(qualityEventsTable.userId, userId), eq(qualityEventsTable.entityId, entityId)))
        .orderBy(desc(qualityEventsTable.createdAt))
      : await this.db.select().from(qualityEventsTable).where(eq(qualityEventsTable.userId, userId)).orderBy(desc(qualityEventsTable.createdAt));

    return rows.map(mapQualityEventRow);
  }

  async getHoldings(userId: string) {
    const rows = await this.db.select().from(holdingsTable).where(eq(holdingsTable.userId, userId)).orderBy(desc(holdingsTable.createdAt));
    return rows.map(mapHoldingRecordRow);
  }

  async getPortfolioPositions(userId: string) {
    const [holdings, events] = await Promise.all([
      this.getHoldings(userId),
      this.getHoldingEvents(userId)
    ]);

    return buildPortfolioPositions(holdings, events);
  }

  async archiveHolding(userId: string, id: string) {
    return this.setHoldingStatus(userId, id, "已归档");
  }

  async restoreHolding(userId: string, id: string) {
    return this.setHoldingStatus(userId, id, "已确认");
  }

  private async setHoldingStatus(userId: string, id: string, status: HoldingRecord["status"]) {
    const [row] = await this.db
      .update(holdingsTable)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(and(eq(holdingsTable.userId, userId), eq(holdingsTable.id, id)))
      .returning();

    if (row) {
      const archived = status === "已归档";
      await this.createQualityEvent(userId, {
        entityType: "holding",
        entityId: id,
        eventType: archived ? "holding_archived" : "holding_restored",
        severity: archived ? "warning" : "info",
        summary: archived ? `正式持仓已归档：${id}` : `正式持仓已恢复：${id}`,
        metadata: JSON.stringify({
          ticker: row.ticker,
          sourceIngestItemId: row.sourceIngestItemId
        })
      });
    }

    return row ? mapHoldingRecordRow(row) : undefined;
  }

  async getHoldingEvents(userId: string) {
    const rows = await this.db.select().from(holdingEventsTable).where(eq(holdingEventsTable.userId, userId)).orderBy(desc(holdingEventsTable.createdAt));
    return rows.map(mapHoldingEventRow);
  }

  async getExtractionCandidates(userId: string, ingestItemId: string) {
    const rows = await this.db
      .select()
      .from(extractionCandidatesTable)
      .where(and(eq(extractionCandidatesTable.userId, userId), eq(extractionCandidatesTable.ingestItemId, ingestItemId)))
      .orderBy(desc(extractionCandidatesTable.createdAt));

    return rows.map(mapExtractionCandidateRow);
  }

  async createExtractionCandidate(userId: string, request: CreateExtractionCandidateRequest) {
    const candidate = {
      id: `EXT-${Date.now()}`,
      userId,
      ...request,
      fallbackUsed: request.fallbackUsed === undefined ? undefined : request.fallbackUsed ? 1 : 0,
      retryable: request.retryable === undefined ? undefined : request.retryable ? 1 : 0
    };
    const [row] = await this.db.insert(extractionCandidatesTable).values(candidate).returning();

    return mapExtractionCandidateRow(row);
  }

  async createIngestItem(userId: string, request: CreateIngestItemRequest) {
    const item: IngestItem = {
      id: `ING-${Date.now()}`,
      source: request.source,
      sourceName: request.sourceName,
      sourceType: request.sourceType,
      publishedAt: request.publishedAt,
      reportingPeriod: request.reportingPeriod,
      kind: request.kind,
      ticker: request.ticker ?? "UNKNOWN",
      confidence: request.confidence ?? "0.00",
      status: "待复核",
      rawText: request.rawText,
      storageObjectKey: request.storageObjectKey,
      fileName: request.fileName,
      mimeType: request.mimeType,
      fileSize: request.fileSize,
      extractedTicker: request.extractedTicker,
      extractedAction: request.extractedAction,
      extractedConfidence: request.extractedConfidence,
      extractionSummary: request.extractionSummary,
      extractedAt: request.extractedAt
    };
    const [row] = await this.db.insert(ingestItemsTable).values({ ...item, userId }).returning();

    return mapIngestItemRow(row);
  }

  async acceptIngestItem(userId: string, id: string, request: AcceptIngestItemRequest) {
    const item = await this.findIngestItem(userId, id);

    if (!item) {
      return undefined;
    }

    const rawText = request.notes ? `${item.rawText}\nReviewer note: ${request.notes}` : item.rawText;
    const updatedItem = await this.updateIngestItem(userId, id, { status: "已接受", rawText });

    if (updatedItem) {
      await this.createAcceptedHolding(userId, updatedItem);
    }

    return updatedItem;
  }

  async rejectIngestItem(userId: string, id: string, request: RejectIngestItemRequest) {
    const item = await this.findIngestItem(userId, id);

    if (!item) {
      return undefined;
    }

    return this.updateIngestItem(userId, id, {
      status: "已驳回",
      rawText: `${item.rawText}\nReject reason: ${request.reason}`
    });
  }

  async updateIngestItem(userId: string, id: string, request: UpdateIngestItemRequest) {
    const [row] = await this.db
      .update(ingestItemsTable)
      .set({
        ...request,
        status: request.status ?? "已修改",
        updatedAt: new Date()
      })
      .where(and(eq(ingestItemsTable.userId, userId), eq(ingestItemsTable.id, id)))
      .returning();

    return row ? mapIngestItemRow(row) : undefined;
  }

  async getDailyCapabilityUsage(userId: string) {
    const day = currentDay();
    const [row] = await this.db
      .select()
      .from(dailyCapabilityUsageTable)
      .where(and(eq(dailyCapabilityUsageTable.userId, userId), eq(dailyCapabilityUsageTable.day, day)))
      .limit(1);

    return row ? mapDailyCapabilityUsageRow(row) : emptyDailyCapabilityUsage(day);
  }

  async incrementDailyCapabilityUsage(userId: string, capability: CapabilityName, limit?: number) {
    const day = currentDay();
    const increments = {
      ragQueries: capability === "rag_query" ? 1 : 0,
      extractionRequests: capability === "extract_signal" ? 1 : 0,
      imageUploads: capability === "image_upload" ? 1 : 0
    };
    const belowLimit = limit === undefined
      ? sql`true`
      : capability === "rag_query"
        ? sql`${dailyCapabilityUsageTable.ragQueries} < ${limit}`
        : capability === "extract_signal"
          ? sql`${dailyCapabilityUsageTable.extractionRequests} < ${limit}`
          : sql`${dailyCapabilityUsageTable.imageUploads} < ${limit}`;
    const [row] = await this.db
      .insert(dailyCapabilityUsageTable)
      .values({ userId, day, ...increments })
      .onConflictDoUpdate({
        target: [dailyCapabilityUsageTable.userId, dailyCapabilityUsageTable.day],
        set: {
          ragQueries: sql`${dailyCapabilityUsageTable.ragQueries} + ${increments.ragQueries}`,
          extractionRequests: sql`${dailyCapabilityUsageTable.extractionRequests} + ${increments.extractionRequests}`,
          imageUploads: sql`${dailyCapabilityUsageTable.imageUploads} + ${increments.imageUploads}`,
          updatedAt: new Date()
        },
        where: belowLimit
      })
      .returning();

    return row ? mapDailyCapabilityUsageRow(row) : undefined;
  }

  async createCapabilityTrace(userId: string, trace: Omit<CapabilityTrace, "id" | "createdAt">) {
    const [row] = await this.db
      .insert(capabilityTracesTable)
      .values({
        id: `CTR-${Date.now()}-${randomUUID().slice(0, 8)}`,
        userId,
        ...trace
      })
      .returning();

    return mapCapabilityTraceRow(row);
  }

  async exportAccountData(userScope: string) {
    const [ingestItems, holdings, holdingEvents, qualityEvents, capabilityTraceRows] = await Promise.all([
      this.getIngestItems(userScope),
      this.getHoldings(userScope),
      this.getHoldingEvents(userScope),
      this.getQualityEvents(userScope),
      this.db.select().from(capabilityTracesTable).where(eq(capabilityTracesTable.userId, userScope)).orderBy(desc(capabilityTracesTable.createdAt))
    ]);
    const extractionCandidateGroups = await Promise.all(
      ingestItems.map((item) => this.getExtractionCandidates(userScope, item.id))
    );

    return {
      exportedAt: new Date().toISOString(),
      userScope,
      ingestItems,
      extractionCandidates: extractionCandidateGroups.flat(),
      holdings,
      holdingEvents,
      qualityEvents,
      capabilityTraces: capabilityTraceRows.map(mapCapabilityTraceRow)
    };
  }

  async deleteAccountData(userScope: string) {
    const snapshot = await this.exportAccountData(userScope);

    await this.db.delete(extractionCandidatesTable).where(eq(extractionCandidatesTable.userId, userScope));
    await this.db.delete(holdingEventsTable).where(eq(holdingEventsTable.userId, userScope));
    await this.db.delete(holdingsTable).where(eq(holdingsTable.userId, userScope));
    await this.db.delete(ingestItemsTable).where(eq(ingestItemsTable.userId, userScope));
    await this.db.delete(qualityEventsTable).where(eq(qualityEventsTable.userId, userScope));
    await this.db.delete(capabilityTracesTable).where(eq(capabilityTracesTable.userId, userScope));
    await this.db.delete(dailyCapabilityUsageTable).where(eq(dailyCapabilityUsageTable.userId, userScope));

    return {
      deletedAt: new Date().toISOString(),
      userScope,
      deleted: {
        ingestItems: snapshot.ingestItems.length,
        extractionCandidates: snapshot.extractionCandidates.length,
        holdings: snapshot.holdings.length,
        holdingEvents: snapshot.holdingEvents.length,
        qualityEvents: snapshot.qualityEvents.length,
        capabilityTraces: snapshot.capabilityTraces.length
      }
    };
  }

  private async findIngestItem(userId: string, id: string) {
    const [row] = await this.db.select().from(ingestItemsTable).where(and(eq(ingestItemsTable.userId, userId), eq(ingestItemsTable.id, id))).limit(1);

    return row ? mapIngestItemRow(row) : undefined;
  }

  private async createAcceptedHolding(userId: string, item: IngestItem) {
    const action = item.extractedAction ?? "观察";
    const confidence = item.extractedConfidence ?? item.confidence;
    const holdingId = `HLD-${item.id}`;
    const eventId = `HEV-${item.id}`;
    const summary = item.extractionSummary ?? `人工接受 ${item.ticker} 候选记录`;
    const [existingEvent] = await this.db
      .select()
      .from(holdingEventsTable)
      .where(and(eq(holdingEventsTable.userId, userId), eq(holdingEventsTable.ingestItemId, item.id)))
      .limit(1);
    const [existingHolding] = await this.db
      .select()
      .from(holdingsTable)
      .where(and(eq(holdingsTable.userId, userId), eq(holdingsTable.id, holdingId)))
      .limit(1);

    if (existingHolding) {
      await this.db
        .update(holdingsTable)
        .set({
          ticker: item.ticker,
          source: item.source,
          sourceName: item.sourceName,
          sourceType: item.sourceType,
          publishedAt: item.publishedAt,
          reportingPeriod: item.reportingPeriod,
          sourceIngestItemId: item.id,
          lastAction: action,
          confidence,
          status: "已确认",
          updatedAt: new Date()
        })
        .where(and(eq(holdingsTable.userId, userId), eq(holdingsTable.id, holdingId)));
    } else {
      await this.db.insert(holdingsTable).values({
        id: holdingId,
        userId,
        ticker: item.ticker,
        source: item.source,
        sourceName: item.sourceName,
        sourceType: item.sourceType,
        publishedAt: item.publishedAt,
        reportingPeriod: item.reportingPeriod,
        sourceIngestItemId: item.id,
        lastAction: action,
        confidence,
        status: "已确认"
      });
    }

    if (existingEvent) {
      await this.db
        .update(holdingEventsTable)
        .set({
          holdingId,
          ticker: item.ticker,
          action,
          confidence,
          summary
        })
        .where(and(eq(holdingEventsTable.userId, userId), eq(holdingEventsTable.id, existingEvent.id)));
    } else {
      await this.db.insert(holdingEventsTable).values({
        id: eventId,
        userId,
        holdingId,
        ingestItemId: item.id,
        ticker: item.ticker,
        action,
        confidence,
        summary
      });
    }
  }

  private async createQualityEvent(userId: string, input: Omit<QualityEvent, "id" | "createdAt">) {
    await this.db.insert(qualityEventsTable).values({
      id: `QEV-${Date.now()}-${randomUUID().slice(0, 8)}`,
      userId,
      ...input
    });
  }
}

function mapIngestItemRow(row: IngestItemRow): IngestItem {
  return {
    id: row.id,
    source: row.source,
    sourceName: row.sourceName ?? undefined,
    sourceType: row.sourceType ? researchSourceTypeSchema.parse(row.sourceType) : undefined,
    publishedAt: row.publishedAt ?? undefined,
    reportingPeriod: row.reportingPeriod ?? undefined,
    kind: row.kind,
    ticker: row.ticker,
    confidence: row.confidence,
    status: row.status,
    rawText: row.rawText,
    storageObjectKey: row.storageObjectKey ?? undefined,
    fileName: row.fileName ?? undefined,
    mimeType: row.mimeType ?? undefined,
    fileSize: row.fileSize ?? undefined,
    extractedTicker: row.extractedTicker ?? undefined,
    extractedAction: row.extractedAction ? signalActionSchema.parse(row.extractedAction) : undefined,
    extractedConfidence: row.extractedConfidence ?? undefined,
    extractionSummary: row.extractionSummary ?? undefined,
    extractedAt: row.extractedAt ?? undefined
  };
}

function mapSourceRow(row: SourceRow): SourceItem {
  return {
    name: row.name,
    platform: row.platform,
    type: row.type,
    status: row.status,
    lastSync: row.lastSync,
    records: row.records,
    parser: row.parser
  };
}

function mapExtractionCandidateRow(row: ExtractionCandidateRow): ExtractionCandidate {
  return {
    id: row.id,
    ingestItemId: row.ingestItemId,
    provider: extractionProviderSchema.parse(row.provider),
    ticker: row.ticker,
    action: signalActionSchema.parse(row.action),
    confidence: row.confidence,
    summary: row.summary,
    status: row.status === "success" || row.status === "fallback" || row.status === "error" ? row.status : undefined,
    fallbackUsed: row.fallbackUsed === null ? undefined : row.fallbackUsed === 1,
    retryable: row.retryable === null ? undefined : row.retryable === 1,
    providerError: row.providerError ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

function mapHoldingRecordRow(row: HoldingRecordRow): HoldingRecord {
  return {
    id: row.id,
    ticker: row.ticker,
    source: row.source,
    sourceName: row.sourceName ?? undefined,
    sourceType: row.sourceType ? researchSourceTypeSchema.parse(row.sourceType) : undefined,
    publishedAt: row.publishedAt ?? undefined,
    reportingPeriod: row.reportingPeriod ?? undefined,
    sourceIngestItemId: row.sourceIngestItemId,
    lastAction: signalActionSchema.parse(row.lastAction),
    confidence: row.confidence,
    status: row.status === "已归档" ? "已归档" : "已确认",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapHoldingEventRow(row: HoldingEventRow): HoldingEvent {
  return {
    id: row.id,
    holdingId: row.holdingId,
    ingestItemId: row.ingestItemId,
    ticker: row.ticker,
    action: signalActionSchema.parse(row.action),
    confidence: row.confidence,
    summary: row.summary,
    createdAt: row.createdAt.toISOString()
  };
}

function mapQualityEventRow(row: QualityEventRow): QualityEvent {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    eventType: row.eventType,
    severity: row.severity === "warning" || row.severity === "error" ? row.severity : "info",
    summary: row.summary,
    metadata: row.metadata ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

function mapCapabilityTraceRow(row: CapabilityTraceRow): CapabilityTrace {
  return {
    id: row.id,
    capability: row.capability,
    status: row.status,
    durationMs: row.durationMs,
    inputSummary: row.inputSummary ?? undefined,
    outputSummary: row.outputSummary ?? undefined,
    errorCode: row.errorCode ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

function mapDailyCapabilityUsageRow(row: DailyCapabilityUsageRow): DailyCapabilityUsage {
  return {
    day: row.day,
    ragQueries: row.ragQueries,
    extractionRequests: row.extractionRequests,
    imageUploads: row.imageUploads
  };
}

function emptyDailyCapabilityUsage(day = currentDay()): DailyCapabilityUsage {
  return { day, ragQueries: 0, extractionRequests: 0, imageUploads: 0 };
}

function currentDay() {
  return new Date().toISOString().slice(0, 10);
}
