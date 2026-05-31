import type {
  AcceptIngestItemRequest,
  CreateIngestItemRequest,
  CreateExtractionCandidateRequest,
  DashboardPayload,
  ExtractionCandidate,
  HoldingEvent,
  HoldingRecord,
  IngestItem,
  PortfolioPosition,
  QualityEvent,
  QualitySummary,
  RejectIngestItemRequest,
  SourceItem,
  UpdateSourceRequest,
  UpdateIngestItemRequest,
  AccountExport,
  AccountDeleteResponse,
  CapabilityName,
  CapabilityTrace,
  DailyCapabilityUsage
} from "@pit/shared";
import type { RagRetrievalRequest, RagRetrievalSnapshot } from "../rag/retrieval.js";

export interface PortfolioRepository {
  getDashboard(userId: string): Promise<DashboardPayload> | DashboardPayload;
  getIngestItems(userId: string): Promise<IngestItem[]> | IngestItem[];
  getSources(userId: string): Promise<SourceItem[]> | SourceItem[];
  updateSource(userId: string, name: string, request: UpdateSourceRequest): Promise<SourceItem | undefined> | SourceItem | undefined;
  getQualitySummary(userId: string): Promise<QualitySummary> | QualitySummary;
  getQualityEvents(userId: string, entityId?: string): Promise<QualityEvent[]> | QualityEvent[];
  getHoldings(userId: string): Promise<HoldingRecord[]> | HoldingRecord[];
  getPortfolioPositions(userId: string): Promise<PortfolioPosition[]> | PortfolioPosition[];
  archiveHolding(userId: string, id: string): Promise<HoldingRecord | undefined> | HoldingRecord | undefined;
  restoreHolding(userId: string, id: string): Promise<HoldingRecord | undefined> | HoldingRecord | undefined;
  getHoldingEvents(userId: string): Promise<HoldingEvent[]> | HoldingEvent[];
  getExtractionCandidates(userId: string, ingestItemId: string): Promise<ExtractionCandidate[]> | ExtractionCandidate[];
  getExtractionCandidatesByIngestItemIds?(userId: string, ingestItemIds: string[]): Promise<ExtractionCandidate[]> | ExtractionCandidate[];
  getRagRetrievalSnapshot?(request: RagRetrievalRequest): Promise<RagRetrievalSnapshot> | RagRetrievalSnapshot;
  createExtractionCandidate(userId: string, request: CreateExtractionCandidateRequest): Promise<ExtractionCandidate> | ExtractionCandidate;
  createIngestItem(userId: string, request: CreateIngestItemRequest): Promise<IngestItem> | IngestItem;
  acceptIngestItem(userId: string, id: string, request: AcceptIngestItemRequest): Promise<IngestItem | undefined> | IngestItem | undefined;
  rejectIngestItem(userId: string, id: string, request: RejectIngestItemRequest): Promise<IngestItem | undefined> | IngestItem | undefined;
  updateIngestItem(userId: string, id: string, request: UpdateIngestItemRequest): Promise<IngestItem | undefined> | IngestItem | undefined;
  getDailyCapabilityUsage(userId: string): Promise<DailyCapabilityUsage> | DailyCapabilityUsage;
  incrementDailyCapabilityUsage(userId: string, capability: CapabilityName, limit?: number): Promise<DailyCapabilityUsage | undefined> | DailyCapabilityUsage | undefined;
  createCapabilityTrace(userId: string, trace: Omit<CapabilityTrace, "id" | "createdAt">): Promise<CapabilityTrace> | CapabilityTrace;
  exportAccountData(userScope: string): Promise<AccountExport> | AccountExport;
  deleteAccountData(userScope: string): Promise<AccountDeleteResponse> | AccountDeleteResponse;
}
