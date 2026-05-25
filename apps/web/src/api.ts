import {
  accountDeleteResponseSchema,
  accountExportSchema,
  dashboardPayloadSchema,
  extractionCandidateSchema,
  holdingEventSchema,
  holdingRecordSchema,
  ingestItemSchema,
  portfolioPositionSchema,
  qualityEventSchema,
  opsStatusSchema,
  ragQueryResponseSchema,
  sourceItemSchema,
  type CreateIngestItemRequest,
  type DashboardPayload,
  type ExtractionCandidate,
  type HoldingEvent,
  type HoldingRecord,
  type IngestItem,
  type PortfolioPosition,
  type QualityEvent,
  type AccountDeleteResponse,
  type AccountExport,
  type OpsStatus,
  type RagQueryRequest,
  type RagQueryResponse,
  type RejectIngestItemRequest,
  type SourceItem,
  type UpdateSourceRequest,
  type UpdateIngestItemRequest
} from "@pit/shared";

const defaultApiBaseUrl = import.meta.env.PROD ? "" : "http://127.0.0.1:8787";
const demoSessionStorageKey = "pit-demo-session-id";
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (import.meta.env.VITE_DEMO_MODE === "true") headers.set("X-Demo-Session-Id", getDemoSessionId());

  return fetch(input, { ...init, headers });
}

function getDemoSessionId() {
  const current = window.localStorage.getItem(demoSessionStorageKey);

  if (current) return current;

  const next = crypto.randomUUID();
  window.localStorage.setItem(demoSessionStorageKey, next);
  return next;
}

export async function fetchDashboardPayload(signal?: AbortSignal): Promise<DashboardPayload> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/dashboard`, { signal });

  if (!response.ok) {
    throw new Error(`Dashboard API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return dashboardPayloadSchema.parse(payload);
}

export async function fetchOpsStatus(signal?: AbortSignal): Promise<OpsStatus> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ops/status`, { signal });

  if (!response.ok) {
    throw new Error(`Ops status API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return opsStatusSchema.parse(payload);
}

export async function exportAccountData(signal?: AbortSignal): Promise<AccountExport> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/account/export`, { signal });

  if (!response.ok) {
    throw new Error(`Export account data failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return accountExportSchema.parse(payload);
}

export async function deleteAccountData(): Promise<AccountDeleteResponse> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/account/data`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(`Delete account data failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return accountDeleteResponseSchema.parse(payload);
}

export async function fetchIngestItems(signal?: AbortSignal): Promise<IngestItem[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items`, { signal });

  if (!response.ok) {
    throw new Error(`Ingest items API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.array().parse(payload);
}

export async function fetchIngestItem(id: string, signal?: AbortSignal): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}`, { signal });

  if (!response.ok) {
    throw new Error(`Ingest item API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}

export async function fetchSources(signal?: AbortSignal): Promise<SourceItem[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/sources`, { signal });

  if (!response.ok) {
    throw new Error(`Sources API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return sourceItemSchema.array().parse(payload);
}

export async function fetchQualityEvents(entityId?: string): Promise<QualityEvent[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const search = entityId ? `?entityId=${encodeURIComponent(entityId)}` : "";
  const response = await apiFetch(`${baseUrl}/quality-events${search}`);

  if (!response.ok) {
    throw new Error(`Quality events API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return qualityEventSchema.array().parse(payload);
}

export async function updateSource(name: string, request: UpdateSourceRequest): Promise<SourceItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/sources/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Update source failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return sourceItemSchema.parse(payload);
}

export async function fetchHoldings(signal?: AbortSignal): Promise<HoldingRecord[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/holdings`, { signal });

  if (!response.ok) {
    throw new Error(`Holdings API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return holdingRecordSchema.array().parse(payload);
}

export async function fetchPortfolioPositions(signal?: AbortSignal): Promise<PortfolioPosition[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/portfolio/positions`, { signal });

  if (!response.ok) {
    throw new Error(`Portfolio positions API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return portfolioPositionSchema.array().parse(payload);
}

export async function queryRag(
  query: string,
  conversationHistory: RagQueryRequest["conversationHistory"] = []
): Promise<RagQueryResponse> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, conversationHistory })
  });

  if (!response.ok) {
    throw new Error(`RAG query API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ragQueryResponseSchema.parse(payload);
}

export async function archiveHolding(id: string): Promise<HoldingRecord> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/holdings/${id}/archive`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Archive holding failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return holdingRecordSchema.parse(payload);
}

export async function restoreHolding(id: string): Promise<HoldingRecord> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/holdings/${id}/restore`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Restore holding failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return holdingRecordSchema.parse(payload);
}

export async function fetchHoldingEvents(signal?: AbortSignal): Promise<HoldingEvent[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/holding-events`, { signal });

  if (!response.ok) {
    throw new Error(`Holding events API failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return holdingEventSchema.array().parse(payload);
}

export async function createIngestItem(request: CreateIngestItemRequest): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Create ingest item failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}

export async function uploadIngestImage(file: File): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(`${baseUrl}/ingest-items/upload-image`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Upload ingest image failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}

export async function extractIngestItem(id: string): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}/extract`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Extract ingest item failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}

export async function fetchExtractionCandidates(id: string): Promise<ExtractionCandidate[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}/extraction-candidates`);

  if (!response.ok) {
    throw new Error(`Fetch extraction candidates failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return extractionCandidateSchema.array().parse(payload);
}

export async function fetchIngestImageUrl(id: string): Promise<{ url: string; expiresInSeconds: number }> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}/image-url`);

  if (!response.ok) {
    throw new Error(`Fetch ingest image URL failed: ${response.status}`);
  }

  return response.json() as Promise<{ url: string; expiresInSeconds: number }>;
}

export async function acceptIngestItem(id: string): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewer: "local-user" })
  });

  if (!response.ok) {
    throw new Error(`Accept ingest item failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}

export async function rejectIngestItem(id: string, request: RejectIngestItemRequest): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Reject ingest item failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}

export async function updateIngestItem(id: string, request: UpdateIngestItemRequest): Promise<IngestItem> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const response = await apiFetch(`${baseUrl}/ingest-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Update ingest item failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  return ingestItemSchema.parse(payload);
}
