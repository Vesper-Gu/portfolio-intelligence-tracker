import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { createMockRepository } from "../src/repository.js";

test("GET /health returns service status", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "portfolio-intelligence-tracker-api"
  });
});

test("GET /dashboard does not present synthetic holdings analysis before records are accepted", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/dashboard" });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.heatmapColumns, []);
  assert.deepEqual(body.heatmapRows, []);
  assert.equal(body.qualitySummary.pendingReview, 3);
});

test("GET /ops/status returns provider, privacy, and cost state", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/ops/status" });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.auth.currentUserId, "local-dev-user");
  assert.equal(body.privacy.externalFactsAllowed, false);
  assert.equal(typeof body.providers.ragLlm.configured, "boolean");
  assert.equal(body.costControls.maxUploadMb, 20);
});

test("account export and delete endpoints return user data controls", async () => {
  const app = buildApp();
  await app.inject({
    method: "POST",
    url: "/ingest-items",
    payload: {
      source: "用户粘贴文本",
      kind: "text",
      rawText: "NVDA follow-up note",
      ticker: "NVDA"
    }
  });

  const exportResponse = await app.inject({ method: "GET", url: "/account/export" });
  const exported = exportResponse.json();
  assert.equal(exportResponse.statusCode, 200);
  assert.equal(exported.userScope, "local-dev-user");
  assert.ok(exported.ingestItems.length > 0);

  const deleteResponse = await app.inject({ method: "DELETE", url: "/account/data" });
  const deleted = deleteResponse.json();
  assert.equal(deleteResponse.statusCode, 200);
  assert.ok(deleted.deleted.ingestItems > 0);

  const afterDeleteResponse = await app.inject({ method: "GET", url: "/account/export" });
  assert.equal(afterDeleteResponse.json().ingestItems.length, 0);
});

test("external auth isolates account data by verified user", async () => {
  const app = buildApp({
    authMode: "external",
    authVerifier: async (authorization) => {
      if (authorization === "Bearer token-a") return "user-a";
      if (authorization === "Bearer token-b") return "user-b";
      throw new Error("unauthorized");
    }
  });
  const userAHeaders = { authorization: "Bearer token-a" };
  const userBHeaders = { authorization: "Bearer token-b" };

  assert.equal((await app.inject({ method: "GET", url: "/account/export" })).statusCode, 401);

  await app.inject({
    method: "POST",
    url: "/ingest-items",
    headers: userAHeaders,
    payload: {
      source: "private note",
      kind: "text",
      rawText: "NET private research",
      ticker: "NET"
    }
  });

  const userA = (await app.inject({ method: "GET", url: "/account/export", headers: userAHeaders })).json();
  const userB = (await app.inject({ method: "GET", url: "/account/export", headers: userBHeaders })).json();

  assert.equal(userA.userScope, "user-a");
  assert.equal(userA.ingestItems.length, 1);
  assert.equal(userB.userScope, "user-b");
  assert.equal(userB.ingestItems.length, 0);
});

test("RAG retrieval does not expose another verified user's evidence", async () => {
  const app = buildApp({
    authMode: "external",
    authVerifier: async (authorization) => {
      if (authorization === "Bearer token-a") return "user-a";
      if (authorization === "Bearer token-b") return "user-b";
      throw new Error("unauthorized");
    }
  });
  const userAHeaders = { authorization: "Bearer token-a" };
  const userBHeaders = { authorization: "Bearer token-b" };
  const created = await app.inject({
    method: "POST",
    url: "/ingest-items",
    headers: userAHeaders,
    payload: {
      source: "private note",
      kind: "text",
      rawText: "NET private research",
      ticker: "NET"
    }
  });
  const ingestItemId = created.json().id;

  await app.inject({ method: "POST", url: `/ingest-items/${ingestItemId}/extract`, headers: userAHeaders });
  await app.inject({
    method: "POST",
    url: `/ingest-items/${ingestItemId}/accept`,
    headers: userAHeaders,
    payload: { reviewer: "user-a" }
  });
  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    headers: userBHeaders,
    payload: { query: "NET 有哪些证据？" }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().citations, []);
  assert.match(response.json().answer, /没有找到 NET/);
});

test("demo auth serves synthetic positions and isolates each browser session", async () => {
  const app = buildApp({
    authMode: "demo",
    authVerifier: () => "unused",
    extractionProvider: {
      extract() {
        throw new Error("Demo must not use configured extraction provider");
      }
    },
    ragAnswerGenerator: {
      async generate() {
        throw new Error("Demo must not use configured answer generator");
      }
    },
    imageUploader: {
      async uploadImage() {
        throw new Error("Demo must not store uploaded images");
      },
      async createSignedUrl() {
        throw new Error("Demo must not issue stored image URLs");
      },
      async downloadImage() {
        throw new Error("Demo must not load stored images");
      },
      async deleteImage() {
        throw new Error("Demo must not delete stored images");
      }
    }
  });
  const sessionAHeaders = { "x-demo-session-id": "session-alpha-0001" };
  const sessionBHeaders = { "x-demo-session-id": "session-bravo-0002" };

  assert.equal((await app.inject({ method: "GET", url: "/dashboard" })).statusCode, 401);

  const initialDashboard = (await app.inject({
    method: "GET",
    url: "/dashboard",
    headers: sessionAHeaders
  })).json();

  assert.ok(initialDashboard.heatmapColumns.includes("NVDA"));
  assert.ok(initialDashboard.heatmapColumns.includes("SMH"));
  assert.equal(initialDashboard.heatmapRows.length, 2);

  const opsStatus = (await app.inject({ method: "GET", url: "/ops/status", headers: sessionAHeaders })).json();
  assert.equal(opsStatus.auth.mode, "demo");
  assert.equal(opsStatus.providers.vision.configured, false);
  assert.equal(opsStatus.providers.ragLlm.configured, false);
  assert.equal(opsStatus.providers.storage.configured, false);

  const imageResponse = await app.inject({
    method: "POST",
    url: "/ingest-items/upload-image",
    headers: sessionAHeaders
  });
  assert.equal(imageResponse.statusCode, 503);

  const ragResponse = await app.inject({
    method: "POST",
    url: "/rag/query",
    headers: sessionAHeaders,
    payload: { query: "NVDA 当前有哪些资料？" }
  });
  assert.equal(ragResponse.json().answerMode, "template");

  await app.inject({
    method: "POST",
    url: "/ingest-items",
    headers: sessionAHeaders,
    payload: {
      source: "用户粘贴文本",
      sourceName: "Session A Note",
      sourceType: "personal_note",
      kind: "text",
      rawText: "NET session-specific note",
      ticker: "NET"
    }
  });

  const userA = (await app.inject({ method: "GET", url: "/account/export", headers: sessionAHeaders })).json();
  const userB = (await app.inject({ method: "GET", url: "/account/export", headers: sessionBHeaders })).json();

  assert.equal(userA.ingestItems.length, 4);
  assert.equal(userB.ingestItems.length, 3);
  assert.ok(userA.userScope.startsWith("demo-"));
  assert.notEqual(userA.userScope, userB.userScope);
});

test("demo static shell can load before a browser session is created", async () => {
  const priorServeWeb = process.env.SERVE_WEB;
  process.env.SERVE_WEB = "true";

  try {
    const app = buildApp({
      authMode: "demo",
      authVerifier: () => "unused"
    });
    app.get("/", async () => "demo shell");
    app.get("/assets/app.js", async () => "demo asset");

    assert.equal((await app.inject({ method: "GET", url: "/" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/assets/app.js" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/dashboard" })).statusCode, 401);
  } finally {
    if (priorServeWeb === undefined) delete process.env.SERVE_WEB;
    else process.env.SERVE_WEB = priorServeWeb;
  }
});

test("account deletion removes only the current user's stored images", async () => {
  const deletedObjectKeys: string[] = [];
  const app = buildApp({
    authMode: "external",
    authVerifier: () => "image-user",
    imageUploader: {
      async uploadImage() {
        return { bucket: "images", objectKey: "unused" };
      },
      async createSignedUrl() {
        return "https://example.test/image";
      },
      async downloadImage() {
        return Buffer.from("");
      },
      async deleteImage(objectKey) {
        deletedObjectKeys.push(objectKey);
      }
    }
  });

  await app.inject({
    method: "POST",
    url: "/ingest-items",
    headers: { authorization: "Bearer image-user" },
    payload: {
      source: "storage://images/ingest/image-user/test.png",
      kind: "screenshot",
      rawText: "uploaded image",
      storageObjectKey: "ingest/image-user/test.png",
      fileName: "test.png",
      mimeType: "image/png",
      fileSize: 1
    }
  });

  const response = await app.inject({ method: "DELETE", url: "/account/data", headers: { authorization: "Bearer image-user" } });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(deletedObjectKeys, ["ingest/image-user/test.png"]);
});

test("GET /sources returns configured data sources", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/sources" });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.length, 5);
  assert.equal(body[0].parser, "tweet_position_v1");
});

test("PATCH /sources/:name updates parser configuration", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "PATCH",
    url: "/sources/SEC%2013F",
    payload: {
      status: "需配置",
      parser: "filing_position_v2"
    }
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.name, "SEC 13F");
  assert.equal(body.status, "需配置");
  assert.equal(body.parser, "filing_position_v2");

  const listResponse = await app.inject({ method: "GET", url: "/sources" });
  const source = listResponse.json().find((candidate: { name: string }) => candidate.name === "SEC 13F");
  assert.equal(source.parser, "filing_position_v2");

  const eventsResponse = await app.inject({ method: "GET", url: "/quality-events?entityId=SEC%2013F" });
  const events = eventsResponse.json();
  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].entityType, "source");
  assert.equal(events[0].eventType, "source_config_updated");
  assert.match(events[0].summary, /SEC 13F/);
});

test("POST /ingest-items creates a new pending review item", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/ingest-items",
    payload: {
      source: "https://example.com/portfolio-note",
      sourceName: "Sample Growth Fund",
      sourceType: "fund_filing",
      publishedAt: "2026-05-15",
      reportingPeriod: "2026 Q1",
      kind: "link",
      rawText: "https://example.com/portfolio-note",
      ticker: "UNKNOWN"
    }
  });
  const body = response.json();

  assert.equal(response.statusCode, 201);
  assert.equal(body.id, "ING-2000");
  assert.equal(body.kind, "link");
  assert.equal(body.status, "待复核");
  assert.equal(body.sourceName, "Sample Growth Fund");
  assert.equal(body.sourceType, "fund_filing");
  assert.equal(body.reportingPeriod, "2026 Q1");

  const listResponse = await app.inject({ method: "GET", url: "/ingest-items" });
  assert.equal(listResponse.json()[0].id, "ING-2000");
});

test("GET /ingest-items/:id returns source item for trace", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/ingest-items/ING-1024"
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.id, "ING-1024");
  assert.equal(body.ticker, "NVDA");
});

test("POST /ingest-items/upload-image requires storage configuration", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/ingest-items/upload-image"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "Image storage is not configured");
});

test("POST /ingest-items/:id/extract writes candidate fields", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/extract"
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.id, "ING-1024");
  assert.equal(body.ticker, "NVDA");
  assert.equal(body.extractedTicker, "NVDA");
  assert.equal(body.extractedAction, "加仓");
  assert.equal(body.status, "可接受");
  assert.match(body.extractionSummary, /人工确认队列/);

  const candidatesResponse = await app.inject({
    method: "GET",
    url: "/ingest-items/ING-1024/extraction-candidates"
  });
  const candidates = candidatesResponse.json();

  assert.equal(candidatesResponse.statusCode, 200);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].provider, "rule_v1");
  assert.equal(candidates[0].ticker, "NVDA");
});

test("GET /ingest-items/:id/image-url requires storage configuration", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/ingest-items/ING-1025/image-url"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "Image storage is not configured");
});

test("POST /ingest-items/:id/accept marks an item accepted", async () => {
  const app = buildApp();
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/extract"
  });
  const response = await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.id, "ING-1024");
  assert.equal(body.status, "已接受");

  const listResponse = await app.inject({ method: "GET", url: "/ingest-items" });
  assert.equal(listResponse.json()[0].status, "已接受");

  const holdingsResponse = await app.inject({ method: "GET", url: "/holdings" });
  const holdings = holdingsResponse.json();
  assert.equal(holdingsResponse.statusCode, 200);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].id, "HLD-ING-1024");
  assert.equal(holdings[0].ticker, "NVDA");
  assert.equal(holdings[0].lastAction, "加仓");
  assert.equal(holdings[0].sourceName, "@Investor_X");
  assert.equal(holdings[0].sourceType, "kol_post");
  assert.equal(holdings[0].publishedAt, "2026-05-12");

  const eventsResponse = await app.inject({ method: "GET", url: "/holding-events" });
  const events = eventsResponse.json();
  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "HEV-ING-1024");
  assert.equal(events[0].ingestItemId, "ING-1024");

  const repeatAcceptResponse = await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });
  const repeatedEventsResponse = await app.inject({ method: "GET", url: "/holding-events" });
  assert.equal(repeatedEventsResponse.json().length, 1);
  assert.equal(repeatAcceptResponse.statusCode, 200);
});

test("POST /ingest-items/:id/accept updates an existing accepted holding", async () => {
  const app = buildApp();
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/extract"
  });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });
  await app.inject({
    method: "PATCH",
    url: "/ingest-items/ING-1024",
    payload: {
      ticker: "TSLA",
      extractedTicker: "TSLA",
      extractedAction: "风险",
      extractedConfidence: "0.91",
      extractionSummary: "复核后改为 TSLA 风险候选。"
    }
  });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const holdingsResponse = await app.inject({ method: "GET", url: "/holdings" });
  const eventsResponse = await app.inject({ method: "GET", url: "/holding-events" });
  const holdings = holdingsResponse.json();
  const events = eventsResponse.json();

  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].ticker, "TSLA");
  assert.equal(holdings[0].lastAction, "风险");
  assert.equal(holdings[0].confidence, "0.91");
  assert.equal(events.length, 1);
  assert.equal(events[0].ticker, "TSLA");
  assert.equal(events[0].summary, "复核后改为 TSLA 风险候选。");
});

test("GET /portfolio/positions aggregates active accepted holdings by ticker", async () => {
  const app = buildApp();
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-1026/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1026/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({ method: "GET", url: "/portfolio/positions" });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.length, 2);
  assert.equal(body[0].ticker, "NVDA");
  assert.equal(body[0].netStance, "看多");
  assert.equal(body[0].netScore, 1);
  assert.equal(body[0].holdingsCount, 1);
  assert.equal(body[0].sourceCount, 1);
  assert.equal(body[0].avgConfidence, "0.82");
  assert.deepEqual(body[0].sources, ["@Investor_X"]);
  assert.equal(body[1].ticker, "SMH");
  assert.equal(body[1].netStance, "中性");

  const dashboardResponse = await app.inject({ method: "GET", url: "/dashboard" });
  const dashboard = dashboardResponse.json();
  const kolRow = dashboard.heatmapRows.find((row: { label: string }) => row.label === "@Investor_X");
  const filingRow = dashboard.heatmapRows.find((row: { label: string }) => row.label === "Sample Fund 13F");

  assert.equal(dashboardResponse.statusCode, 200);
  assert.ok(dashboard.heatmapColumns.includes("NVDA"));
  assert.ok(dashboard.heatmapColumns.includes("SMH"));
  assert.ok(kolRow);
  assert.ok(filingRow);
  assert.equal(kolRow.cells[dashboard.heatmapColumns.indexOf("NVDA")], "positive");
  assert.equal(filingRow.cells[dashboard.heatmapColumns.indexOf("SMH")], "warning");
});

test("POST /rag/query answers with citations from accepted data", async () => {
  const app = buildApp();
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NVDA 当前仓位信号是什么？" }
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.query, "NVDA 当前仓位信号是什么？");
  assert.match(body.answer, /NVDA/);
  assert.ok(body.citations.length > 0);
  assert.equal(body.citations[0].entityType, "position");
  assert.equal(body.citations[0].sourceIngestItemId, "ING-1024");
});

test("POST /rag/query varies answer by question intent", async () => {
  const app = buildApp();
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const evidenceResponse = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NVDA 有哪些证据？" }
  });
  const riskResponse = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "有什么风险？" }
  });
  const recentResponse = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NVDA 最近有什么变化？" }
  });
  const unknownResponse = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "ZZZZ 当前仓位信号是什么？" }
  });

  assert.match(evidenceResponse.json().answer, /找到以下证据/);
  assert.match(riskResponse.json().answer, /风险|减仓|复核/);
  assert.match(recentResponse.json().answer, /最近变化|最近已确认记录/);
  assert.match(unknownResponse.json().answer, /没有找到 ZZZZ/);
  assert.notEqual(evidenceResponse.json().answer, recentResponse.json().answer);
});

test("POST /rag/query can use an injected LLM answer generator", async () => {
  const app = buildApp({
    ragAnswerGenerator: {
      async generate(input) {
        return `LLM ANSWER: ${input.intent} / ${input.citations.length}`;
      }
    }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NVDA 有哪些证据？" }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.json().answer, /^LLM ANSWER: evidence/);
});

test("POST /rag/query does not send storage object paths to the answer layer", async () => {
  const app = buildApp({
    ragAnswerGenerator: {
      async generate(input) {
        return input.contextSummary;
      }
    }
  });
  await app.inject({
    method: "POST",
    url: "/ingest-items",
    payload: {
      source: "storage://private-bucket/user-1/research-shot.png",
      kind: "text",
      rawText: "Image uploaded: research-shot.png (image/png, 69253 bytes)\nStorage object: storage://private-bucket/user-1/research-shot.png\nReviewer note: accepted model candidate",
      ticker: "NET"
    }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-2000/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-2000/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NET 的来源截图是什么？" }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.json().answer, /截图上传/);
  assert.doesNotMatch(response.json().answer, /storage:\/\//);
  assert.doesNotMatch(response.json().answer, /private-bucket/);
  assert.doesNotMatch(response.json().answer, /Image uploaded|Storage object|Reviewer note|69253 bytes/);
});

test("POST /rag/query falls back when LLM answer generation fails", async () => {
  const app = buildApp({
    ragAnswerGenerator: {
      async generate() {
        throw new Error("LLM unavailable");
      }
    }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NVDA 有哪些证据？" }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.json().answer, /找到以下证据/);
});

test("capability harness persists daily usage and exports traces through the repository", async () => {
  const repository = createMockRepository();
  const app = buildApp({ repository });

  await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "当前有哪些持仓？" }
  });

  const restartedApp = buildApp({ repository });
  const opsResponse = await restartedApp.inject({ method: "GET", url: "/ops/status" });
  const exportResponse = await restartedApp.inject({ method: "GET", url: "/account/export" });

  assert.equal(opsResponse.statusCode, 200);
  assert.equal(opsResponse.json().sessionUsage.ragQueries, 1);
  assert.equal(exportResponse.statusCode, 200);
  assert.equal(exportResponse.json().capabilityTraces.length, 3);
  assert.deepEqual(
    exportResponse.json().capabilityTraces.map((trace: { skillName: string }) => trace.skillName),
    ["validate_grounding", "generate_grounded_answer", "retrieve_evidence"]
  );
  assert.ok(exportResponse.json().capabilityTraces.every((trace: { status: string }) => trace.status === "success"));
});

test("POST /rag/query falls back when LLM answer contains an unsupported ticker", async () => {
  const app = buildApp({
    ragAnswerGenerator: {
      async generate() {
        return "NVDA 已有资料，同时 TSLA 也值得关注。";
      }
    }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: { query: "NVDA 有哪些证据？" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().answerMode, "template");
  assert.doesNotMatch(response.json().answer, /TSLA/);
});

test("POST /rag/query uses conversation history for follow-up questions", async () => {
  const app = buildApp();
  await app.inject({ method: "POST", url: "/ingest-items/ING-1024/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: {
      query: "有哪些证据？",
      conversationHistory: [
        { role: "user", content: "先看 NVDA" },
        { role: "assistant", content: "NVDA 当前已有一条资料库记录。" }
      ]
    }
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.match(body.answer, /NVDA|证据/);
  assert.ok(body.citations.some((citation: { title: string }) => citation.title.includes("NVDA")));
});

test("POST /holdings/:id/archive archives a holding and records quality event", async () => {
  const app = buildApp();
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/extract"
  });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/holdings/HLD-ING-1024/archive"
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.id, "HLD-ING-1024");
  assert.equal(body.status, "已归档");

  const eventsResponse = await app.inject({
    method: "GET",
    url: "/quality-events?entityId=HLD-ING-1024"
  });
  const events = eventsResponse.json();

  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "holding_archived");
});

test("POST /holdings/:id/restore restores an archived holding and records quality event", async () => {
  const app = buildApp();
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/extract"
  });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1024/accept",
    payload: { reviewer: "local-user" }
  });
  await app.inject({
    method: "POST",
    url: "/holdings/HLD-ING-1024/archive"
  });

  const response = await app.inject({
    method: "POST",
    url: "/holdings/HLD-ING-1024/restore"
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, "已确认");

  const eventsResponse = await app.inject({
    method: "GET",
    url: "/quality-events?entityId=HLD-ING-1024"
  });
  const eventTypes = eventsResponse.json().map((event: { eventType: string }) => event.eventType);
  assert.deepEqual(eventTypes, ["holding_restored", "holding_archived"]);
});

test("POST /ingest-items/:id/reject marks an item rejected", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/ingest-items/ING-1025/reject",
    payload: { reviewer: "local-user", reason: "OCR confidence too low" }
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.id, "ING-1025");
  assert.equal(body.status, "已驳回");
  assert.match(body.rawText, /OCR confidence too low/);
});

test("PATCH /ingest-items/:id updates editable fields", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "PATCH",
    url: "/ingest-items/ING-1026",
    payload: { ticker: "SMH.US", confidence: "0.93" }
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.ticker, "SMH.US");
  assert.equal(body.confidence, "0.93");
  assert.equal(body.status, "已修改");
});
