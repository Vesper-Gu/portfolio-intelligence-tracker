import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  accountDeleteResponseSchema,
  accountExportSchema,
  holdingRecordSchema,
  ingestItemSchema,
  portfolioPositionSchema,
  ragQueryResponseSchema
} from "@pit/shared";

type SmokeFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface BetaAcceptanceConfig {
  baseUrl: string;
  userAToken: string;
  userBToken: string;
  imagePath?: string;
  allowDelete?: boolean;
}

interface BetaAcceptanceOptions {
  fetchImpl?: SmokeFetch;
  log?: (line: string) => void;
}

type StepStatus = "pass" | "skip";

interface StepResult {
  status: StepStatus;
  name: string;
  detail?: string;
}

const smokeTicker = "SMKBETA";
const smokeSource = "Beta smoke synthetic note";
const smokeRawText = `${smokeTicker} synthetic private beta validation note. Action: observe. Source: beta smoke.`;

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): BetaAcceptanceConfig {
  const baseUrl = env.BETA_BASE_URL?.trim();
  const userAToken = env.BETA_USER_A_TOKEN?.trim();
  const userBToken = env.BETA_USER_B_TOKEN?.trim();

  if (!baseUrl) throw new Error("BETA_BASE_URL is required");
  if (!userAToken) throw new Error("BETA_USER_A_TOKEN is required");
  if (!userBToken) throw new Error("BETA_USER_B_TOKEN is required");

  return {
    baseUrl,
    userAToken,
    userBToken,
    imagePath: env.BETA_SMOKE_IMAGE_PATH?.trim() || undefined,
    allowDelete: env.BETA_SMOKE_ALLOW_DELETE === "true"
  };
}

export async function runBetaAcceptance(config: BetaAcceptanceConfig, options: BetaAcceptanceOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? console.log;
  const client = new SmokeClient(config.baseUrl, fetchImpl);
  const results: StepResult[] = [];

  const record = (result: StepResult) => {
    results.push(result);
    log(formatResult(result));
  };

  const health = await client.request("GET", "/health");
  assertStatus(health, 200, "health");
  const healthBody = await health.json() as { ok?: boolean };
  assertCondition(healthBody.ok === true, "health should return ok=true");
  record({ status: "pass", name: "health", detail: "service ok" });

  await expectUnauthorized(client, "GET", "/dashboard", record);
  await expectUnauthorized(client, "GET", "/account/export", record);
  await expectUnauthorized(client, "POST", "/rag/query", record, { query: "当前资料关注什么？" });

  const userA = bearer(config.userAToken);
  const userB = bearer(config.userBToken);
  const userABefore = await loadExport(client, userA);
  const userBBefore = await loadExport(client, userB);
  record({
    status: "pass",
    name: "authenticated export",
    detail: `userA ingest=${userABefore.ingestItems.length}; userB ingest=${userBBefore.ingestItems.length}`
  });

  const created = ingestItemSchema.parse(await client.json("POST", "/ingest-items", {
    headers: userA,
    body: {
      source: smokeSource,
      sourceName: "Private Beta Smoke",
      sourceType: "personal_note",
      kind: "text",
      rawText: smokeRawText,
      ticker: smokeTicker
    }
  }));
  record({ status: "pass", name: "text ingest", detail: `ingest=${redactId(created.id)}` });

  const extracted = ingestItemSchema.parse(await client.json("POST", `/ingest-items/${created.id}/extract`, { headers: userA }));
  assertCondition(Boolean(extracted.extractedTicker || extracted.ticker), "extract should produce a ticker");
  assertCondition(Boolean(extracted.extractionSummary), "extract should produce a summary");
  record({
    status: "pass",
    name: "extract",
    detail: `ticker=${extracted.extractedTicker ?? extracted.ticker}; status=${extracted.status}`
  });

  const accepted = ingestItemSchema.parse(await client.json("POST", `/ingest-items/${created.id}/accept`, {
    headers: userA,
    body: { reviewer: "beta-smoke" }
  }));
  assertCondition(accepted.status === "已接受", "accepted ingest item should be marked as 已接受");
  record({ status: "pass", name: "accept", detail: `ingest=${redactId(accepted.id)}` });

  const holdings = holdingRecordSchema.array().parse(await client.json("GET", "/holdings", { headers: userA }));
  const positions = portfolioPositionSchema.array().parse(await client.json("GET", "/portfolio/positions", { headers: userA }));
  assertCondition(holdings.some((holding) => holding.sourceIngestItemId === created.id), "user A holdings should include accepted smoke item");
  assertCondition(positions.some((position) => position.ticker === (extracted.extractedTicker ?? extracted.ticker)), "user A positions should include smoke ticker");
  record({ status: "pass", name: "portfolio aggregation", detail: `holdings=${holdings.length}; positions=${positions.length}` });

  const userAAfter = await loadExport(client, userA);
  const userBAfter = await loadExport(client, userB);
  assertCondition(userAAfter.ingestItems.some((item) => item.id === created.id), "user A export should include smoke item");
  assertCondition(!userBAfter.ingestItems.some((item) => item.id === created.id), "user B export must not include user A smoke item");
  record({
    status: "pass",
    name: "account isolation",
    detail: `userA ingest=${userAAfter.ingestItems.length}; userB ingest=${userBAfter.ingestItems.length}`
  });

  const userBRag = ragQueryResponseSchema.parse(await client.json("POST", "/rag/query", {
    headers: userB,
    body: { query: `${smokeTicker} 有哪些资料？` }
  }));
  assertCondition(userBRag.citations.length === 0, "user B RAG should not cite user A smoke evidence");
  record({ status: "pass", name: "rag isolation", detail: "userB citations=0" });

  const userARag = ragQueryResponseSchema.parse(await client.json("POST", "/rag/query", {
    headers: userA,
    body: { query: `${smokeTicker} 有哪些资料？` }
  }));
  assertCondition(userARag.citations.length > 0 || /资料不足|没有找到|未找到/.test(userARag.answer), "user A RAG should cite evidence or state insufficient data");
  assertCondition(!/实时行情|买入建议|卖出建议|保证收益/.test(userARag.answer), "RAG answer should not include unsupported market advice");
  record({ status: "pass", name: "rag boundary", detail: `mode=${userARag.answerMode ?? "unknown"}; citations=${userARag.citations.length}` });

  if (config.imagePath) {
    await runImageSmoke(client, userA, userB, config.imagePath, record);
  } else {
    record({ status: "skip", name: "image storage", detail: "BETA_SMOKE_IMAGE_PATH not set" });
  }

  if (config.allowDelete) {
    const deleted = accountDeleteResponseSchema.parse(await client.json("DELETE", "/account/data", { headers: userA }));
    const afterDelete = await loadExport(client, userA);
    assertCondition(!afterDelete.ingestItems.some((item) => item.id === created.id), "user A smoke item should be deleted");
    record({
      status: "pass",
      name: "account delete",
      detail: `deleted ingest=${deleted.deleted.ingestItems}; holdings=${deleted.deleted.holdings}`
    });
  } else {
    record({ status: "skip", name: "account delete", detail: "set BETA_SMOKE_ALLOW_DELETE=true to run destructive delete validation" });
  }

  return {
    passed: results.filter((result) => result.status === "pass").length,
    skipped: results.filter((result) => result.status === "skip").length,
    results
  };
}

class SmokeClient {
  constructor(private readonly baseUrl: string, private readonly fetchImpl: SmokeFetch) {}

  async request(method: string, path: string, options: { headers?: Record<string, string>; body?: unknown } = {}) {
    const headers = new Headers(options.headers);
    let body: BodyInit | undefined;

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    return this.fetchImpl(new URL(path, withTrailingSlash(this.baseUrl)).toString(), { method, headers, body });
  }

  async json(method: string, path: string, options: { headers?: Record<string, string>; body?: unknown } = {}) {
    const response = await this.request(method, path, options);

    if (!response.ok) {
      throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
    }

    return response.json() as Promise<unknown>;
  }

  async uploadImage(path: string, headers: Record<string, string>, bytes: Buffer) {
    const form = new FormData();
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    form.set("file", new Blob([arrayBuffer], { type: mimeTypeForPath(path) }), basename(path));

    return this.fetchImpl(new URL("/ingest-items/upload-image", withTrailingSlash(this.baseUrl)).toString(), {
      method: "POST",
      headers,
      body: form
    });
  }
}

async function expectUnauthorized(
  client: SmokeClient,
  method: string,
  path: string,
  record: (result: StepResult) => void,
  body?: unknown
) {
  const response = await client.request(method, path, { body });
  assertStatus(response, 401, `${method} ${path} without token`);
  record({ status: "pass", name: `unauthorized ${method} ${path}`, detail: "401" });
}

async function loadExport(client: SmokeClient, headers: Record<string, string>) {
  return accountExportSchema.parse(await client.json("GET", "/account/export", { headers }));
}

async function runImageSmoke(
  client: SmokeClient,
  userA: Record<string, string>,
  userB: Record<string, string>,
  imagePath: string,
  record: (result: StepResult) => void
) {
  const bytes = await readFile(imagePath);
  const uploadResponse = await client.uploadImage(imagePath, userA, bytes);

  if (!uploadResponse.ok) throw new Error(`POST /ingest-items/upload-image failed with HTTP ${uploadResponse.status}`);

  const item = ingestItemSchema.parse(await uploadResponse.json());
  assertCondition(Boolean(item.storageObjectKey), "uploaded image item should include a storage object key");
  record({ status: "pass", name: "image upload", detail: `ingest=${redactId(item.id)}; bytes=${bytes.length}` });

  const signedUrlResponse = await client.request("GET", `/ingest-items/${item.id}/image-url`, { headers: userA });
  assertStatus(signedUrlResponse, 200, "user A image signed URL");
  record({ status: "pass", name: "image signed url", detail: "userA status=200" });

  const userBResponse = await client.request("GET", `/ingest-items/${item.id}/image-url`, { headers: userB });
  assertCondition(userBResponse.status === 404 || userBResponse.status === 400, "user B should not access user A image URL");
  record({ status: "pass", name: "image isolation", detail: `userB status=${userBResponse.status}` });
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function assertStatus(response: Response, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(`${label} expected HTTP ${expected}, received HTTP ${response.status}`);
  }
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function formatResult(result: StepResult) {
  const marker = result.status === "pass" ? "PASS" : "SKIP";
  return `[${marker}] ${result.name}${result.detail ? ` - ${result.detail}` : ""}`;
}

function redactId(id: string) {
  if (id.length <= 8) return `${id.slice(0, 2)}...`;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function mimeTypeForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const summary = await runBetaAcceptance(configFromEnv());
    console.log(`[DONE] beta smoke passed=${summary.passed} skipped=${summary.skipped}`);
  } catch (error) {
    console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
