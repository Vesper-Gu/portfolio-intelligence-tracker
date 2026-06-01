import {
  dashboardPayload,
  ingestItems,
  qualitySummary,
  sources,
  type ExtractionCandidate,
  type CapabilityName,
  type CapabilityTrace,
  type DailyCapabilityUsage,
  type HoldingEvent,
  type HoldingRecord,
  type IngestItem,
  type QualityEvent
} from "@pit/shared";
import type {
  AcceptIngestItemRequest,
  CreateExtractionCandidateRequest,
  CreateIngestItemRequest,
  RejectIngestItemRequest,
  UpdateIngestItemRequest
} from "@pit/shared";
import { buildEvidenceDashboard, buildPortfolioPositions } from "../portfolio/positions.js";
import type { PortfolioRepository } from "./portfolioRepository.js";

interface MockUserState {
  ingestItems: IngestItem[];
  extractionCandidates: ExtractionCandidate[];
  holdings: HoldingRecord[];
  holdingEvents: HoldingEvent[];
  qualityEvents: QualityEvent[];
  capabilityTraces: CapabilityTrace[];
  dailyCapabilityUsage: DailyCapabilityUsage;
  sources: typeof sources;
  nextIngestId: number;
  nextCandidateId: number;
  nextQualityEventId: number;
}

export function createMockRepository(): PortfolioRepository {
  const states = new Map<string, MockUserState>();

  function stateFor(userId: string) {
    const current = states.get(userId);

    if (current) return current;

    const usesDemoFixtures = userId === "local-dev-user" || userId.startsWith("demo-");
    const next: MockUserState = {
      ingestItems: usesDemoFixtures ? ingestItems.map((item) => ({ ...item })) : [],
      extractionCandidates: [],
      holdings: [],
      holdingEvents: [],
      qualityEvents: [],
      capabilityTraces: [],
      dailyCapabilityUsage: emptyDailyUsage(),
      sources: sources.map((source) => ({ ...source })),
      nextIngestId: 2000,
      nextCandidateId: 3000,
      nextQualityEventId: 4000
    };

    if (userId.startsWith("demo-")) {
      seedDemoAcceptedHoldings(next);
    }

    states.set(userId, next);
    return next;
  }

  function updateItem(state: MockUserState, id: string, patch: Partial<IngestItem>) {
    const index = state.ingestItems.findIndex((item) => item.id === id);

    if (index === -1) return undefined;

    const nextItem = { ...state.ingestItems[index], ...patch };
    state.ingestItems = [...state.ingestItems.slice(0, index), nextItem, ...state.ingestItems.slice(index + 1)];
    return nextItem;
  }

  return {
    getDashboard(userId) {
      return buildEvidenceDashboard(dashboardPayload, stateFor(userId).holdings);
    },
    getIngestItems(userId) {
      return stateFor(userId).ingestItems;
    },
    getSources(userId) {
      return stateFor(userId).sources;
    },
    updateSource(userId, name, request) {
      const state = stateFor(userId);
      const index = state.sources.findIndex((source) => source.name === name);

      if (index === -1) return undefined;

      const nextSource = { ...state.sources[index], ...request };
      const event: QualityEvent = {
        id: `QEV-${state.nextQualityEventId++}`,
        entityType: "source",
        entityId: name,
        eventType: "source_config_updated",
        severity: "info",
        summary: `来源配置已更新：${name}`,
        metadata: JSON.stringify(request),
        createdAt: new Date().toISOString()
      };

      state.sources = [...state.sources.slice(0, index), nextSource, ...state.sources.slice(index + 1)];
      state.qualityEvents = [event, ...state.qualityEvents];
      return nextSource;
    },
    getQualitySummary(_userId) {
      return qualitySummary;
    },
    getQualityEvents(userId, entityId) {
      const events = stateFor(userId).qualityEvents;
      return entityId ? events.filter((event) => event.entityId === entityId) : events;
    },
    getHoldings(userId) {
      return stateFor(userId).holdings;
    },
    getPortfolioPositions(userId) {
      const state = stateFor(userId);
      return buildPortfolioPositions(state.holdings, state.holdingEvents);
    },
    archiveHolding(userId, id) {
      return setHoldingArchiveStatus(stateFor(userId), id, "已归档");
    },
    restoreHolding(userId, id) {
      return setHoldingArchiveStatus(stateFor(userId), id, "已确认");
    },
    getHoldingEvents(userId) {
      return stateFor(userId).holdingEvents;
    },
    getExtractionCandidates(userId, ingestItemId) {
      return stateFor(userId).extractionCandidates.filter((candidate) => candidate.ingestItemId === ingestItemId);
    },
    getExtractionCandidatesByIngestItemIds(userId, ingestItemIds) {
      const ids = new Set(ingestItemIds);
      return stateFor(userId).extractionCandidates.filter((candidate) => ids.has(candidate.ingestItemId));
    },
    createExtractionCandidate(userId, request: CreateExtractionCandidateRequest) {
      const state = stateFor(userId);
      const candidate: ExtractionCandidate = {
        id: `EXT-${state.nextCandidateId++}`,
        ...request,
        createdAt: new Date().toISOString()
      };

      state.extractionCandidates = [candidate, ...state.extractionCandidates];
      return candidate;
    },
    createIngestItem(userId, request: CreateIngestItemRequest) {
      const state = stateFor(userId);
      const item: IngestItem = {
        id: `ING-${state.nextIngestId++}`,
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

      state.ingestItems = [item, ...state.ingestItems];
      return item;
    },
    acceptIngestItem(userId, id, request: AcceptIngestItemRequest) {
      const state = stateFor(userId);
      const item = state.ingestItems.find((candidate) => candidate.id === id);
      const patch: Partial<IngestItem> = { status: "已接受" };

      if (request.notes && item) patch.rawText = `${item.rawText}\nReviewer note: ${request.notes}`;

      const updatedItem = updateItem(state, id, patch);

      if (updatedItem) createAcceptedHolding(state, updatedItem);
      return updatedItem;
    },
    rejectIngestItem(userId, id, request: RejectIngestItemRequest) {
      const state = stateFor(userId);
      return updateItem(state, id, {
        status: "已驳回",
        rawText: `${state.ingestItems.find((item) => item.id === id)?.rawText ?? ""}\nReject reason: ${request.reason}`
      });
    },
    updateIngestItem(userId, id, request: UpdateIngestItemRequest) {
      return updateItem(stateFor(userId), id, { ...request, status: request.status ?? "已修改" });
    },
    getDailyCapabilityUsage(userId) {
      return dailyUsageFor(stateFor(userId));
    },
    incrementDailyCapabilityUsage(userId, capability: CapabilityName, limit?: number) {
      const state = stateFor(userId);
      const usage = dailyUsageFor(state);
      if (limit !== undefined && usageValue(usage, capability) >= limit) return undefined;
      incrementUsage(usage, capability);
      return usage;
    },
    createCapabilityTrace(userId, trace) {
      const state = stateFor(userId);
      const created: CapabilityTrace = {
        id: `CTR-${state.capabilityTraces.length + 1}`,
        ...trace,
        createdAt: new Date().toISOString()
      };
      state.capabilityTraces = [created, ...state.capabilityTraces];
      return created;
    },
    exportAccountData(userScope) {
      const state = stateFor(userScope);
      return {
        exportedAt: new Date().toISOString(),
        userScope,
        ingestItems: state.ingestItems,
        extractionCandidates: state.extractionCandidates,
        holdings: state.holdings,
        holdingEvents: state.holdingEvents,
        qualityEvents: state.qualityEvents,
        capabilityTraces: state.capabilityTraces
      };
    },
    deleteAccountData(userScope) {
      const state = stateFor(userScope);
      const deleted = {
        ingestItems: state.ingestItems.length,
        extractionCandidates: state.extractionCandidates.length,
        holdings: state.holdings.length,
        holdingEvents: state.holdingEvents.length,
        qualityEvents: state.qualityEvents.length,
        capabilityTraces: state.capabilityTraces.length
      };

      state.ingestItems = [];
      state.extractionCandidates = [];
      state.holdings = [];
      state.holdingEvents = [];
      state.qualityEvents = [];
      state.capabilityTraces = [];
      state.dailyCapabilityUsage = emptyDailyUsage();
      return { deletedAt: new Date().toISOString(), userScope, deleted };
    }
  };
}

function emptyDailyUsage(): DailyCapabilityUsage {
  return {
    day: new Date().toISOString().slice(0, 10),
    ragQueries: 0,
    extractionRequests: 0,
    imageUploads: 0
  };
}

function dailyUsageFor(state: MockUserState) {
  const day = new Date().toISOString().slice(0, 10);
  if (state.dailyCapabilityUsage.day !== day) state.dailyCapabilityUsage = emptyDailyUsage();
  return state.dailyCapabilityUsage;
}

function incrementUsage(usage: DailyCapabilityUsage, capability: CapabilityName) {
  if (capability === "rag_query") usage.ragQueries += 1;
  if (capability === "extract_signal") usage.extractionRequests += 1;
  if (capability === "image_upload") usage.imageUploads += 1;
}

function usageValue(usage: DailyCapabilityUsage, capability: CapabilityName) {
  if (capability === "rag_query") return usage.ragQueries;
  if (capability === "extract_signal") return usage.extractionRequests;
  return usage.imageUploads;
}

function seedDemoAcceptedHoldings(state: MockUserState) {
  const accepted = [
    { id: "ING-1024", action: "加仓" as const, summary: "KOL 资料记录了 NVDA 的增持观点。" },
    { id: "ING-1026", action: "新建仓" as const, summary: "基金披露中新增 SMH 持仓记录。" },
    { id: "ING-1027", action: "加仓" as const, summary: "研究文章认为 AMD AI 加速器需求强于预期，适合回调加仓。" },
    { id: "ING-1028", action: "减仓" as const, summary: "Macro 来源因交付和利润率压力减持 TSLA，并保留观察。" },
    { id: "ING-1029", action: "持有" as const, summary: "个人研究笔记认为 BTC ETF 流入稳定，但波动回落前不继续加仓。" },
    { id: "ING-1030", action: "持有" as const, summary: "研究文章认为 ETH 质押和 L2 费用增长仍有支撑，维持当前敞口。" },
    { id: "ING-1032", action: "持有" as const, summary: "KOL 继续将 MSFT 作为 AI 基础设施核心持仓。" },
    { id: "ING-1033", action: "观察" as const, summary: "Macro 来源观察 GOOGL 的 AI 搜索利润率压力。" },
    { id: "ING-1034", action: "观察" as const, summary: "截图资料将 NET 加入 Cloud infrastructure 观察名单。" },
    { id: "ING-1035", action: "持有" as const, summary: "13F 显示 MSFT 仍为前五大持仓，季度内未变动。" },
    { id: "ING-1036", action: "观察" as const, summary: "个人笔记认为 NVDA 逻辑仍在，但估值偏高，等待回调。" },
    { id: "ING-1037", action: "新建仓" as const, summary: "研究文章将 META 作为 AI software 新建仓候选。" },
    { id: "ING-1038", action: "风险" as const, summary: "Macro 来源提示 MSTR 是高 beta BTC proxy，需要控制风险预算。" },
    { id: "ING-1039", action: "加仓" as const, summary: "13F sector memo 显示 AMD 小幅加仓。" },
    { id: "ING-1041", action: "持有" as const, summary: "KOL 认为 BTC 仍可作为核心持有，但暂不新增。" },
    { id: "ING-1042", action: "持有" as const, summary: "个人笔记维持 ETH 敞口，等待费用增长进一步确认。" },
    { id: "ING-1044", action: "持有" as const, summary: "研究文章认为 SMH 适合持有半导体广度敞口。" },
    { id: "ING-1045", action: "观察" as const, summary: "个人笔记将 AAPL 保留观察，等待 AI 设备周期证据。" }
  ];

  for (const seed of accepted) {
    const item = state.ingestItems.find((candidate) => candidate.id === seed.id);
    if (!item) continue;

    item.status = "已接受";
    item.extractedAction = seed.action;
    item.extractionSummary = seed.summary;
    createAcceptedHolding(state, item);
  }
}

function setHoldingArchiveStatus(state: MockUserState, id: string, status: HoldingRecord["status"]) {
  const index = state.holdings.findIndex((holding) => holding.id === id);

  if (index === -1) return undefined;

  const nextHolding: HoldingRecord = { ...state.holdings[index], status, updatedAt: new Date().toISOString() };
  const archived = status === "已归档";
  const event: QualityEvent = {
    id: `QEV-${state.nextQualityEventId++}`,
    entityType: "holding",
    entityId: id,
    eventType: archived ? "holding_archived" : "holding_restored",
    severity: archived ? "warning" : "info",
    summary: archived ? `正式持仓已归档：${id}` : `正式持仓已恢复：${id}`,
    metadata: JSON.stringify({ ticker: nextHolding.ticker, sourceIngestItemId: nextHolding.sourceIngestItemId }),
    createdAt: new Date().toISOString()
  };

  state.holdings = [...state.holdings.slice(0, index), nextHolding, ...state.holdings.slice(index + 1)];
  state.qualityEvents = [event, ...state.qualityEvents];
  return nextHolding;
}

function createAcceptedHolding(state: MockUserState, item: IngestItem) {
  const now = new Date().toISOString();
  const action = item.extractedAction ?? "观察";
  const confidence = item.extractedConfidence ?? item.confidence;
  const holding: HoldingRecord = {
    id: `HLD-${item.id}`,
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
    createdAt: now,
    updatedAt: now
  };
  const event: HoldingEvent = {
    id: `HEV-${item.id}`,
    holdingId: holding.id,
    ingestItemId: item.id,
    ticker: item.ticker,
    action,
    confidence,
    summary: item.extractionSummary ?? `人工加入 ${item.ticker} 资料库`,
    createdAt: now
  };

  state.holdings = [holding, ...state.holdings.filter((candidate) => candidate.id !== holding.id)];
  state.holdingEvents = [event, ...state.holdingEvents.filter((candidate) => candidate.ingestItemId !== item.id)];
}
