import type {
  ExtractionCandidate,
  HoldingEvent,
  HoldingRecord,
  IngestItem,
  PortfolioPosition,
  RagCitation,
  RagQueryRequest,
  RagQueryResponse
} from "@pit/shared";
import type { PortfolioRepository } from "../repositories/portfolioRepository.js";
import type { RagAnswerGenerator } from "./llm.js";

interface RagDocument {
  id: string;
  entityType: RagCitation["entityType"];
  entityId: string;
  sourceIngestItemId?: string;
  title: string;
  text: string;
}

export type RagIntent = "position_summary" | "evidence" | "risk" | "recent_changes" | "source_trace" | "overview";

interface RagContext {
  query: string;
  intent: RagIntent;
  scopedTickers: string[];
  unknownTickers: string[];
  positions: PortfolioPosition[];
  holdings: HoldingRecord[];
  events: HoldingEvent[];
  ingestItems: IngestItem[];
  candidates: ExtractionCandidate[];
  citations: RagCitation[];
}

export async function answerRagQuery(
  repository: PortfolioRepository,
  userId: string,
  query: string,
  limit = 6,
  answerGenerator?: RagAnswerGenerator,
  conversationHistory: RagQueryRequest["conversationHistory"] = []
): Promise<RagQueryResponse> {
  const [positions, holdings, events, ingestItems] = await Promise.all([
    repository.getPortfolioPositions(userId),
    repository.getHoldings(userId),
    repository.getHoldingEvents(userId),
    repository.getIngestItems(userId)
  ]);
  const candidateGroups = await Promise.all(
    ingestItems.map(async (item) => repository.getExtractionCandidates(userId, item.id))
  );
  const candidates = candidateGroups.flat();
  const conversationContext = summarizeConversation(conversationHistory);
  const retrievalQuery = buildRetrievalQuery(query, conversationHistory);
  const scopedTickers = extractScopedTickers(retrievalQuery, positions, holdings, events, ingestItems, candidates);
  const unknownTickers = extractUnknownTickerTokens(query, scopedTickers);
  const intent = classifyIntent(retrievalQuery);
  const documents = [
    ...positions.map((position) => positionToDocument(position, holdings)),
    ...holdings.map(holdingToDocument),
    ...events.map(eventToDocument),
    ...ingestItems.map(ingestItemToDocument),
    ...candidates.map(candidateToDocument)
  ];
  const tokens = tokenize(retrievalQuery);
  const scored = documents
    .map((document) => ({
      document,
      score: scoreDocument(document, tokens, scopedTickers, intent)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const citations = scored.map(({ document, score }) => ({
    id: document.id,
    entityType: document.entityType,
    entityId: document.entityId,
    sourceIngestItemId: document.sourceIngestItemId,
    title: document.title,
    snippet: summarize(document.text),
    score: Number(score.toFixed(2))
  }));

  const context = {
    query,
    intent,
    scopedTickers,
    unknownTickers,
    positions,
    holdings,
    events,
    ingestItems,
    candidates,
    citations
  };
  const deterministicAnswer = buildAnswer(context);
  const answerResult = await generateAnswerWithFallback(answerGenerator, {
    query,
    conversationContext,
    intent,
    deterministicAnswer,
    contextSummary: buildContextSummary(scopeData(context)),
    citations
  });

  return {
    query,
    answer: answerResult.answer,
    answerMode: answerResult.mode,
    citations,
    generatedAt: new Date().toISOString()
  };
}

async function generateAnswerWithFallback(
  answerGenerator: RagAnswerGenerator | undefined,
  input: {
    query: string;
    conversationContext: string;
    intent: RagIntent;
    deterministicAnswer: string;
    contextSummary: string;
    citations: RagCitation[];
  }
) {
  if (!answerGenerator) return { answer: input.deterministicAnswer, mode: "template" as const };

  try {
    return { answer: await answerGenerator.generate(input), mode: "llm" as const };
  } catch {
    return { answer: input.deterministicAnswer, mode: "template" as const };
  }
}

function classifyIntent(query: string): RagIntent {
  const normalized = query.toUpperCase();

  if (/(证据|依据|来源|引用|原文|CITATION|EVIDENCE|SOURCE)/i.test(query)) return "evidence";
  if (/(风险|减仓|卖出|冲突|问题|下调|RISK|REDUCE|SELL|TRIM|CONFLICT)/i.test(query)) return "risk";
  if (/(最近|变化|变动|新|上次|什么时候|时间|RECENT|CHANGE|LATEST|WHEN)/i.test(query)) return "recent_changes";
  if (/(截图|图片|上传|TRACE|追溯|链路|SOURCE TRACE|IMAGE|SCREENSHOT)/i.test(query)) return "source_trace";
  if (/(总览|全部|哪些|持仓|组合|OVERVIEW|PORTFOLIO|POSITIONS)/i.test(normalized)) return "overview";

  return "position_summary";
}

function buildRetrievalQuery(query: string, conversationHistory: RagQueryRequest["conversationHistory"]) {
  const recentTurns = (conversationHistory ?? [])
    .slice(-6)
    .map((turn) => turn.content)
    .join("\n");

  return recentTurns ? `${recentTurns}\n${query}` : query;
}

function summarizeConversation(conversationHistory: RagQueryRequest["conversationHistory"]) {
  return (conversationHistory ?? [])
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`)
    .join("\n");
}

function tokenize(query: string) {
  const normalized = query.toUpperCase();
  const latinTokens = normalized.match(/[A-Z0-9._-]{2,}/g) ?? [];
  const chineseTokens = [
    ...[...normalized.matchAll(/[\u4e00-\u9fa5]{2,}/g)].map((match) => match[0]),
    ...["证据", "来源", "原文", "风险", "减仓", "卖出", "最近", "变化", "截图", "图片", "持仓", "仓位"]
      .filter((keyword) => query.includes(keyword))
  ];

  return [...new Set([...latinTokens, ...chineseTokens])];
}

function scoreDocument(document: RagDocument, tokens: string[], scopedTickers: string[], intent: RagIntent) {
  const haystack = `${document.title}\n${document.text}`.toUpperCase();
  let score = 0;

  if (scopedTickers.length) {
    const tickerMatched = scopedTickers.some((ticker) => haystack.includes(ticker));
    if (!tickerMatched) return 0;
    score += 8;
  }

  for (const token of tokens) {
    if (document.title.toUpperCase().includes(token)) score += 4;
    if (haystack.includes(token)) score += 2;
  }

  if (
    score === 0
    && !scopedTickers.length
    && (intent === "overview" || intent === "position_summary")
    && (document.entityType === "position" || document.entityType === "holding")
  ) {
    score = 0.5;
  }

  if (score === 0) return 0;

  if (document.entityType === "position") score += 0.8;
  if (document.entityType === "holding") score += 0.6;
  if (document.entityType === "ingest_item") score += 0.4;
  if (intent === "evidence" && (document.entityType === "ingest_item" || document.entityType === "extraction_candidate")) score += 1.2;
  if (intent === "source_trace" && document.entityType === "ingest_item") score += 1.4;
  if (intent === "recent_changes" && document.entityType === "holding_event") score += 1.4;
  if (intent === "risk" && /(风险|减仓|SELL|SOLD|REDUCE|TRIM|RISK)/i.test(haystack)) score += 2.4;

  return score;
}

function buildAnswer(context: RagContext) {
  if (context.unknownTickers.length && !context.scopedTickers.length) {
    return `当前资料中没有找到 ${context.unknownTickers.join(" / ")} 的相关记录。请先录入并接受相关资料后再查询。`;
  }

  const scoped = scopeData(context);

  if (!hasAnyScopedData(scoped)) {
    return context.scopedTickers.length
      ? `当前资料中没有找到 ${context.scopedTickers.join(" / ")} 的相关记录。请先录入并接受相关资料后再查询。`
      : "当前资料中没有找到能回答该问题的记录。请先录入并接受更多资料后再查询。";
  }

  if (context.intent === "evidence") return buildEvidenceAnswer(scoped, context.citations);
  if (context.intent === "risk") return buildRiskAnswer(scoped, context.citations);
  if (context.intent === "recent_changes") return buildRecentChangesAnswer(scoped);
  if (context.intent === "source_trace") return buildSourceTraceAnswer(scoped);
  if (context.intent === "overview" && !context.scopedTickers.length) return buildOverviewAnswer(scoped);

  return buildPositionSummaryAnswer(scoped, context.citations);
}

function scopeData(context: RagContext) {
  const tickerSet = new Set(context.scopedTickers);
  const byTicker = <T extends { ticker: string }>(items: T[]) => (
    tickerSet.size ? items.filter((item) => tickerSet.has(item.ticker.toUpperCase())) : items
  );
  const holdings = byTicker(context.holdings).filter((holding) => holding.status === "已确认");
  const holdingIds = new Set(holdings.map((holding) => holding.id));
  const ingestIds = new Set([
    ...holdings.map((holding) => holding.sourceIngestItemId),
    ...context.events.filter((event) => tickerSet.size && tickerSet.has(event.ticker.toUpperCase())).map((event) => event.ingestItemId)
  ]);
  const events = tickerSet.size
    ? context.events.filter((event) => tickerSet.has(event.ticker.toUpperCase()) || holdingIds.has(event.holdingId))
    : context.events;
  const positions = byTicker(context.positions);
  const ingestItems = context.ingestItems.filter((item) => (
    tickerSet.size
      ? tickerSet.has(item.ticker.toUpperCase()) || ingestIds.has(item.id)
      : item.status === "已接受" || item.status === "可接受" || item.status === "需人工确认"
  ));
  const scopedIngestIds = new Set(ingestItems.map((item) => item.id));
  const candidates = context.candidates.filter((candidate) => (
    tickerSet.size
      ? tickerSet.has(candidate.ticker.toUpperCase()) || scopedIngestIds.has(candidate.ingestItemId)
      : scopedIngestIds.has(candidate.ingestItemId)
  ));

  return {
    positions,
    holdings,
    events,
    ingestItems,
    candidates
  };
}

function hasAnyScopedData(scoped: ReturnType<typeof scopeData>) {
  return scoped.positions.length > 0
    || scoped.holdings.length > 0
    || scoped.events.length > 0
    || scoped.ingestItems.length > 0
    || scoped.candidates.length > 0;
}

function buildPositionSummaryAnswer(scoped: ReturnType<typeof scopeData>, citations: RagCitation[]) {
  const lines = scoped.positions.slice(0, 4).map((position) => {
    const basis = position.eventCount > 0
      ? `${position.eventCount} 条已确认事件`
      : `${position.sourceCount} 个来源`;

    return `${position.ticker} 目前是${position.netStance}，最新记录是“${position.latestAction}”，依据是 ${basis}。`;
  });
  const fallbackLines = scoped.holdings.slice(0, 4).map((holding) => (
    `${holding.ticker} 有一条已确认记录，最新动作是“${holding.lastAction}”，来源记录是 ${holding.sourceIngestItemId}。`
  ));
  const sourceLine = citations.length
    ? `可回溯的资料包括 ${citations.slice(0, 4).map((citation) => citation.title).join("、")}。`
    : "当前没有命中可引用证据，建议先补充或接受更多资料。";

  return [
    "从已存入并确认的资料看：",
    ...(lines.length ? lines : fallbackLines),
    sourceLine
  ].join("\n");
}

function buildEvidenceAnswer(scoped: ReturnType<typeof scopeData>, citations: RagCitation[]) {
  const evidenceLines = [
    ...scoped.ingestItems.slice(0, 4).map((item) => `来源 ${item.id}：${summarize(item.rawText)}`),
    ...scoped.events.slice(0, 3).map((event) => `确认事件 ${event.id}：${event.summary}`)
  ];
  const citationLine = citations.length
    ? `引用列表：${citations.slice(0, 5).map((citation) => citation.title).join("；")}。`
    : "当前没有额外引用命中。";

  return evidenceLines.length
    ? [`找到以下证据：`, ...evidenceLines, citationLine].join("\n")
    : "当前资料中没有找到可展示的来源证据。";
}

function buildRiskAnswer(scoped: ReturnType<typeof scopeData>, citations: RagCitation[]) {
  const riskyEvents = scoped.events.filter((event) => event.action === "风险" || event.action === "减仓");
  const riskyItems = scoped.ingestItems.filter((item) => /(风险|减仓|SELL|SOLD|REDUCE|TRIM|RISK|CONFLICT|冲突)/i.test(item.rawText));
  const lines = [
    ...riskyEvents.map((event) => `${event.ticker} 有 ${event.action} 事件：${event.summary}`),
    ...riskyItems.map((item) => `${item.ticker} 来源记录需要复核：${summarize(item.rawText)}`)
  ];

  if (!lines.length) {
    return scoped.positions.length || scoped.holdings.length
      ? "当前已存资料中没有看到明确的风险、减仓或冲突信号。"
      : "当前资料中没有找到风险相关记录。";
  }

  const citationLine = citations.length
    ? `相关证据：${citations.slice(0, 4).map((citation) => citation.title).join("；")}。`
    : "建议继续打开来源记录复核原文。";

  return ["当前看到以下风险线索：", ...lines.slice(0, 6), citationLine].join("\n");
}

function buildRecentChangesAnswer(scoped: ReturnType<typeof scopeData>) {
  const sortedEvents = [...scoped.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedHoldings = [...scoped.holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lines = sortedEvents.slice(0, 5).map((event) => (
    `${event.ticker} 在 ${formatDate(event.createdAt)} 记录为 ${event.action}：${event.summary}`
  ));

  if (lines.length) return ["最近变化：", ...lines].join("\n");

  return sortedHoldings.length
    ? ["最近已确认记录：", ...sortedHoldings.slice(0, 5).map((holding) => (
      `${holding.ticker} 最新动作 ${holding.lastAction}，更新时间 ${formatDate(holding.updatedAt)}。`
    ))].join("\n")
    : "当前资料中没有找到最近变化记录。";
}

function buildSourceTraceAnswer(scoped: ReturnType<typeof scopeData>) {
  const lines = scoped.ingestItems.slice(0, 5).map((item) => {
    const candidates = scoped.candidates.filter((candidate) => candidate.ingestItemId === item.id);
    const latestCandidate = candidates[0]
      ? `最近候选为 ${candidates[0].ticker} / ${candidates[0].action}（${candidates[0].provider}）。`
      : "暂无候选历史。";

    return `${item.id} 来自 ${item.source}，类型 ${item.kind}，状态 ${item.status}。${latestCandidate}`;
  });

  return lines.length
    ? ["来源追溯：", ...lines].join("\n")
    : "当前资料中没有找到可追溯的来源记录。";
}

function buildOverviewAnswer(scoped: ReturnType<typeof scopeData>) {
  const positionLines = scoped.positions.slice(0, 6).map((position) => (
    `${position.ticker} 是${position.netStance}，最新动作是“${position.latestAction}”，来自 ${position.sourceCount} 个来源。`
  ));
  const activeCount = scoped.holdings.length;

  return positionLines.length
    ? [`当前资料库里有 ${activeCount} 条已确认记录，聚合后主要看到这些标的：`, ...positionLines, "目前这些结论只代表资料库中已确认的记录，不包含资料库以外的信息。"].join("\n")
    : `当前资料库里有 ${activeCount} 条已确认记录，但还没有可展示的聚合仓位。`;
}

function buildContextSummary(scoped: ReturnType<typeof scopeData>) {
  const positions = scoped.positions.slice(0, 8).map((position) => (
    `- ${position.ticker}: 聚合方向=${position.netStance}; 最新动作=${position.latestAction}; 来源数=${position.sourceCount}; 确认事件数=${position.eventCount}; 更新时间=${formatDate(position.lastUpdated)}`
  ));
  const holdings = scoped.holdings.slice(0, 8).map((holding) => (
    `- ${holding.ticker}: 动作=${holding.lastAction}; 状态=${holding.status}; 来源=${holding.source}; 来源记录=${holding.sourceIngestItemId}; 更新时间=${formatDate(holding.updatedAt)}`
  ));
  const events = scoped.events
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((event) => (
      `- ${event.ticker}: ${event.action}; 时间=${formatDate(event.createdAt)}; 摘要=${event.summary}; 来源记录=${event.ingestItemId}`
    ));
  const ingestItems = scoped.ingestItems.slice(0, 8).map((item) => (
    `- ${item.id}: ticker=${item.ticker}; 类型=${item.kind}; 状态=${item.status}; 来源=${item.source}; 原文摘要=${summarize(item.rawText)}`
  ));

  return [
    "聚合仓位:",
    positions.length ? positions.join("\n") : "- 无",
    "已确认记录:",
    holdings.length ? holdings.join("\n") : "- 无",
    "最近事件:",
    events.length ? events.join("\n") : "- 无",
    "来源记录:",
    ingestItems.length ? ingestItems.join("\n") : "- 无"
  ].join("\n");
}

function extractScopedTickers(
  query: string,
  positions: PortfolioPosition[],
  holdings: HoldingRecord[],
  events: HoldingEvent[],
  ingestItems: IngestItem[],
  candidates: ExtractionCandidate[]
) {
  const knownTickers = new Set([
    ...positions.map((position) => position.ticker.toUpperCase()),
    ...holdings.map((holding) => holding.ticker.toUpperCase()),
    ...events.map((event) => event.ticker.toUpperCase()),
    ...ingestItems.map((item) => item.ticker.toUpperCase()),
    ...candidates.map((candidate) => candidate.ticker.toUpperCase())
  ].filter((ticker) => ticker !== "UNKNOWN"));
  const queryUpper = query.toUpperCase();

  return [...knownTickers].filter((ticker) => queryUpper.includes(ticker));
}

function extractUnknownTickerTokens(query: string, scopedTickers: string[]) {
  const known = new Set(scopedTickers);
  const ignored = new Set(["RAG", "API", "OCR", "SEC", "URL", "LLM", "AI", "KOL", "ETF"]);
  const tokens = query.toUpperCase().match(/\b[A-Z]{2,5}(?:\.[A-Z]{2})?\b/g) ?? [];

  return [...new Set(tokens.filter((token) => !known.has(token) && !ignored.has(token)))];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

function positionToDocument(position: PortfolioPosition, holdings: HoldingRecord[]): RagDocument {
  const sourceHolding = holdings
    .filter((holding) => holding.ticker === position.ticker && holding.status === "已确认")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return {
    id: `RAG-POS-${position.ticker}`,
    entityType: "position",
    entityId: position.ticker,
    sourceIngestItemId: sourceHolding?.sourceIngestItemId,
    title: `Position ${position.ticker}`,
    text: [
      `ticker=${position.ticker}`,
      `netStance=${position.netStance}`,
      `latestAction=${position.latestAction}`,
      `sources=${position.sources.join(" / ")}`,
      `updated=${position.lastUpdated}`
    ].join("\n")
  };
}

function holdingToDocument(holding: HoldingRecord): RagDocument {
  return {
    id: `RAG-HLD-${holding.id}`,
    entityType: "holding",
    entityId: holding.id,
    sourceIngestItemId: holding.sourceIngestItemId,
    title: `Holding ${holding.ticker}`,
    text: [
      `ticker=${holding.ticker}`,
      `action=${holding.lastAction}`,
      `status=${holding.status}`,
      `source=${holding.source}`,
      `sourceIngestItemId=${holding.sourceIngestItemId}`
    ].join("\n")
  };
}

function eventToDocument(event: HoldingEvent): RagDocument {
  return {
    id: `RAG-HEV-${event.id}`,
    entityType: "holding_event",
    entityId: event.id,
    sourceIngestItemId: event.ingestItemId,
    title: `Accepted Event ${event.ticker}`,
    text: [
      `ticker=${event.ticker}`,
      `action=${event.action}`,
      `summary=${event.summary}`,
      `ingestItemId=${event.ingestItemId}`
    ].join("\n")
  };
}

function ingestItemToDocument(item: IngestItem): RagDocument {
  return {
    id: `RAG-ING-${item.id}`,
    entityType: "ingest_item",
    entityId: item.id,
    sourceIngestItemId: item.id,
    title: `Source ${item.ticker} ${item.id}`,
    text: [
      `source=${item.source}`,
      `kind=${item.kind}`,
      `status=${item.status}`,
      `ticker=${item.ticker}`,
      `rawText=${item.rawText}`,
      `extractionSummary=${item.extractionSummary ?? ""}`
    ].join("\n")
  };
}

function candidateToDocument(candidate: ExtractionCandidate): RagDocument {
  return {
    id: `RAG-EXT-${candidate.id}`,
    entityType: "extraction_candidate",
    entityId: candidate.id,
    sourceIngestItemId: candidate.ingestItemId,
    title: `Candidate ${candidate.ticker} ${candidate.provider}`,
    text: [
      `ingestItemId=${candidate.ingestItemId}`,
      `ticker=${candidate.ticker}`,
      `action=${candidate.action}`,
      `provider=${candidate.provider}`,
      `status=${candidate.status ?? ""}`,
      `summary=${candidate.summary}`
    ].join("\n")
  };
}

function summarize(text: string) {
  return text
    .replace(/(?:confidence|avgConfidence)=\d+(?:\.\d+)?/gi, "")
    .replace(/平均置信度\s*\d+(?:\.\d+)?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}
