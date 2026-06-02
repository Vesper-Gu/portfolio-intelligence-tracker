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
import { validateGroundedAnswer } from "./groundedness.js";
import {
  createPortfolioRagRetrievalRepository,
  type RagIntent,
  type RagRetrievalRepository,
  type RagVectorDocument,
  type RagVectorRetriever
} from "./retrieval.js";
export type { RagIntent } from "./retrieval.js";

interface RagDocument extends RagVectorDocument {
  entityType: RagCitation["entityType"];
}

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

export interface RagEvidenceBundle {
  query: string;
  intent: RagIntent;
  conversationContext: string;
  deterministicAnswer: string;
  contextSummary: string;
  citations: RagCitation[];
  retrievalMode: "keyword" | "hybrid";
}

export async function answerRagQuery(
  repository: PortfolioRepository,
  userId: string,
  query: string,
  limit = 6,
  answerGenerator?: RagAnswerGenerator,
  conversationHistory: RagQueryRequest["conversationHistory"] = []
): Promise<RagQueryResponse> {
  const evidence = await retrieveRagEvidence(repository, userId, query, limit, conversationHistory);
  const answerResult = await generateAnswerWithFallback(answerGenerator, evidence);

  return {
    query,
    answer: answerResult.answer,
    answerMode: answerResult.mode,
    citations: evidence.citations,
    generatedAt: new Date().toISOString()
  };
}

export async function retrieveRagEvidence(
  repository: PortfolioRepository,
  userId: string,
  query: string,
  limit = 6,
  conversationHistory: RagQueryRequest["conversationHistory"] = [],
  vectorRetriever?: RagVectorRetriever
): Promise<RagEvidenceBundle> {
  return retrieveRagEvidenceFromRepository(
    createPortfolioRagRetrievalRepository(repository),
    userId,
    query,
    limit,
    conversationHistory,
    vectorRetriever
  );
}

export async function retrieveRagEvidenceFromRepository(
  retrievalRepository: RagRetrievalRepository,
  userId: string,
  query: string,
  limit = 6,
  conversationHistory: RagQueryRequest["conversationHistory"] = [],
  vectorRetriever?: RagVectorRetriever
): Promise<RagEvidenceBundle> {
  const conversationContext = summarizeConversation(conversationHistory);
  const retrievalQuery = buildRetrievalQuery(query, conversationHistory);
  const intent = classifyIntent(retrievalQuery);
  const requestedTickers = extractRequestedTickerTokens(retrievalQuery);
  const { positions, holdings, events, ingestItems, candidates } = await retrievalRepository.retrieveSnapshot({
    userId,
    query: retrievalQuery,
    intent,
    tickers: requestedTickers,
    limit
  });
  const scopedTickers = extractScopedTickers(retrievalQuery, positions, holdings, events, ingestItems, candidates);
  const unknownTickers = extractUnknownTickerTokens(query, scopedTickers);
  const documents = [
    ...positions.map((position) => positionToDocument(position, holdings)),
    ...holdings.map(holdingToDocument),
    ...events.map(eventToDocument),
    ...ingestItems.map(ingestItemToDocument),
    ...candidates.map(candidateToDocument)
  ];
  const tokens = tokenize(retrievalQuery);
  const vectorScores = await loadVectorScores(vectorRetriever, userId, retrievalQuery, documents, limit);
  const scored = documents
    .map((document) => ({
      document,
      score: scoreDocument(document, tokens, scopedTickers, intent) + (vectorScores.get(document.id) ?? 0) * 4
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
  return {
    query,
    conversationContext,
    intent,
    deterministicAnswer,
    contextSummary: buildContextSummary(scopeData(context)),
    citations,
    retrievalMode: vectorScores.size ? "hybrid" : "keyword"
  };
}

async function loadVectorScores(
  vectorRetriever: RagVectorRetriever | undefined,
  userId: string,
  query: string,
  documents: RagDocument[],
  limit: number
) {
  if (!vectorRetriever || !documents.length) return new Map<string, number>();

  try {
    const matches = await vectorRetriever.search(userId, query, documents, limit);
    return new Map(matches.map((match) => [match.documentId, match.score]));
  } catch {
    return new Map<string, number>();
  }
}

async function generateAnswerWithFallback(
  answerGenerator: RagAnswerGenerator | undefined,
  input: RagEvidenceBundle
) {
  if (!answerGenerator || !input.citations.length) return { answer: input.deterministicAnswer, mode: "template" as const };

  try {
    const answer = await answerGenerator.generate(input);
    const validation = validateGroundedAnswer({
      answer,
      contextSummary: input.contextSummary,
      citations: input.citations
    });

    return validation.grounded
      ? { answer, mode: "llm" as const }
      : { answer: input.deterministicAnswer, mode: "template" as const };
  } catch {
    return { answer: input.deterministicAnswer, mode: "template" as const };
  }
}

function classifyIntent(query: string): RagIntent {
  const normalized = query.toUpperCase();

  if (/(证据|依据|来源|引用|原文|为什么|为何|为什么会关注|关注.*原因|判断来自|CITATION|EVIDENCE|SOURCE)/i.test(query)) return "evidence";
  if (/(风险|减仓|卖出|冲突|问题|下调|RISK|REDUCE|SELL|TRIM|CONFLICT)/i.test(query)) return "risk";
  if (/(最近|变化|变动|新|上次|什么时候|时间|RECENT|CHANGE|LATEST|WHEN)/i.test(query)) return "recent_changes";
  if (/(截图|图片|上传|TRACE|追溯|链路|SOURCE TRACE|IMAGE|SCREENSHOT)/i.test(query)) return "source_trace";
  if (/(总览|全部|哪些|持仓|组合|整理过哪些|关注什么|OVERVIEW|PORTFOLIO|POSITIONS)/i.test(normalized)) return "overview";

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
    return buildMissingDataAnswer(context.unknownTickers);
  }

  const scoped = scopeData(context);

  if (!hasAnyScopedData(scoped)) {
    return context.scopedTickers.length
      ? buildMissingDataAnswer(context.scopedTickers)
      : buildMissingDataAnswer([]);
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
  const conclusionLines = scoped.positions.slice(0, 4).map((position) => {
    const basis = position.eventCount > 0
      ? `${position.eventCount} 条已确认事件`
      : `${position.sourceCount} 个来源`;

    return `${position.ticker}：当前资料倾向为${position.netStance}，最新动作是“${position.latestAction}”。这个判断来自 ${basis}，覆盖 ${position.sources.slice(0, 3).join("、") || "已确认资料"}。`;
  });
  const fallbackLines = scoped.holdings.slice(0, 4).map((holding) => (
    `${holding.ticker}：已有一条确认资料，动作是“${holding.lastAction}”，来源为 ${displaySource(holding.source, holding.sourceName)}。`
  ));
  const basisLine = citations.length
    ? "可以继续查看下方证据卡片，核对原始资料和确认记录。"
    : "当前没有命中可引用证据，建议先补充或接受更多资料。";

  return formatStructuredAnswer([
    ["结论", conclusionLines.length ? conclusionLines : fallbackLines],
    ["依据", [basisLine]],
    ["需要复核", ["如果同一标的后续出现减仓、风险或冲突资料，需要回到原始证据再判断。"]],
    ["资料缺口", ["当前回答只覆盖已确认资料；未录入或未确认的研究材料不会参与判断。"]],
    ["可继续追问", ["可以问“有什么需要留意的风险？”、“最近有什么变化？”或指定某个标的继续查证。"]]
  ]);
}

function buildEvidenceAnswer(scoped: ReturnType<typeof scopeData>, citations: RagCitation[]) {
  const evidenceLines = [
    ...scoped.ingestItems.slice(0, 4).map((item) => {
      const meta = [
        item.ticker,
        displaySource(item.source, item.sourceName),
        item.publishedAt ? formatDate(item.publishedAt) : undefined
      ].filter(Boolean).join(" · ");

      return `- ${meta}：${summarize(textForAnswerLayer(item.rawText))}`;
    }),
    ...scoped.events.slice(0, 3).map((event) => `- ${event.ticker} · 已确认${event.action}：${event.summary}`)
  ];
  const citationLine = citations.length
    ? "原始资料和结构化记录已放在下方证据卡片中，方便逐条追溯。"
    : "当前没有额外引用命中。";

  return evidenceLines.length
    ? formatStructuredAnswer([
      ["结论", ["找到以下证据：这些资料能解释当前回答。"]],
      ["依据", evidenceLines],
      ["需要复核", [citationLine]],
      ["资料缺口", ["如果你要判断完整仓位变化，还需要补充尚未录入或尚未确认的资料。"]],
    ["可继续追问", ["可以继续问“有什么需要留意？”、“最近有什么变化？”或“这个判断来自哪些资料？”。"]]
    ])
    : buildMissingDataAnswer([]);
}

function buildRiskAnswer(scoped: ReturnType<typeof scopeData>, citations: RagCitation[]) {
  const riskyEvents = scoped.events.filter((event) => event.action === "风险" || event.action === "减仓");
  const riskyItems = scoped.ingestItems.filter((item) => /(风险|减仓|SELL|SOLD|REDUCE|TRIM|RISK|CONFLICT|冲突)/i.test(item.rawText));
  const lines = [
    ...riskyEvents.map((event) => `- ${event.ticker}：已确认“${event.action}”信号。${event.summary}`),
    ...riskyItems.map((item) => `- ${item.ticker}：${displaySource(item.source, item.sourceName)} 中出现需要复核的表述。${summarize(textForAnswerLayer(item.rawText))}`)
  ];

  if (!lines.length) {
    return scoped.positions.length || scoped.holdings.length
      ? formatStructuredAnswer([
        ["结论", ["当前已确认资料里，没有看到明确的风险、减仓或冲突信号。"]],
        ["依据", ["已确认记录中没有出现风险、减仓、卖出或冲突相关动作。"]],
        ["需要复核", ["这不代表标的没有风险，只代表你目前整理的资料里没有记录到相关证据。"]],
        ["资料缺口", ["如果你有新的 KOL 观点、13F、截图或研究笔记，应先录入并确认。"]],
        ["可继续追问", ["可以指定标的追问，例如“NVDA 有哪些风险证据？”。"]]
      ])
      : buildMissingDataAnswer([]);
  }

  const citationLine = citations.length
    ? "建议打开下方证据卡片，重点核对原文语气、时间和来源。"
    : "建议继续打开来源记录复核原文。";

  return formatStructuredAnswer([
    ["结论", ["当前看到以下风险线索。"]],
    ["依据", lines.slice(0, 6)],
    ["需要复核", [citationLine]],
    ["资料缺口", ["当前只覆盖已确认或可追溯的投研资料，未录入资料不会参与判断。"]],
    ["可继续追问", ["可以问“这些风险来自哪些来源？”或“最近是否有变化？”。"]]
  ]);
}

function buildRecentChangesAnswer(scoped: ReturnType<typeof scopeData>) {
  const sortedEvents = [...scoped.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedHoldings = [...scoped.holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lines = sortedEvents.slice(0, 5).map((event) => (
    `- ${formatDate(event.createdAt)} · ${event.ticker}：${event.action}。${event.summary}`
  ));

  if (lines.length) return formatStructuredAnswer([
    ["结论", ["最近变化：已确认资料中出现了以下更新。"]],
    ["依据", lines],
    ["需要复核", ["这些变化只来自已确认资料，不包含外部实时信息。"]],
    ["资料缺口", ["如果想覆盖最新市场观点，需要先录入并确认新的资料。"]],
    ["可继续追问", ["可以问“这些变化来自哪些资料？”或“有什么需要留意的风险？”。"]]
  ]);

  return sortedHoldings.length
    ? formatStructuredAnswer([
      ["结论", ["最近已确认记录如下。"]],
      ["依据", sortedHoldings.slice(0, 5).map((holding) => (
      `- ${formatDate(holding.updatedAt)} · ${holding.ticker}：${holding.lastAction}，来源 ${displaySource(holding.source, holding.sourceName)}。`
      ))],
      ["资料缺口", ["当前资料中没有更详细的事件变化记录。"]],
      ["可继续追问", ["可以指定一个标的继续问“为什么会关注它？”。"]]
    ])
    : buildMissingDataAnswer([]);
}

function buildSourceTraceAnswer(scoped: ReturnType<typeof scopeData>) {
  const lines = scoped.ingestItems.slice(0, 5).map((item) => {
    const candidates = scoped.candidates.filter((candidate) => candidate.ingestItemId === item.id);
    const latestCandidate = candidates[0]
      ? `AI 曾提取为 ${candidates[0].ticker} / ${candidates[0].action}，当前状态是 ${item.status}。`
      : `当前状态是 ${item.status}。`;

    return `- ${item.ticker}：来自 ${displaySource(item.source, item.sourceName)}，资料类型为 ${sourceTypeLabel(item.sourceType ?? item.kind)}。${latestCandidate}`;
  });

  return lines.length
    ? formatStructuredAnswer([
      ["结论", ["来源追溯：当前问题命中了这些可追溯资料。"]],
      ["依据", lines],
      ["需要复核", ["如果需要核对原文，可以从下方证据卡片进入对应资料。"]],
      ["资料缺口", ["截图上传资料只展示脱敏后的来源信息，不暴露内部存储路径。"]],
      ["可继续追问", ["可以问“这条资料支持什么动作？”或“有没有相反证据？”。"]]
    ])
    : buildMissingDataAnswer([]);
}

function buildOverviewAnswer(scoped: ReturnType<typeof scopeData>) {
  const positionLines = scoped.positions.slice(0, 6).map((position) => (
    `- ${position.ticker}：${position.netStance}，最新动作“${position.latestAction}”，来自 ${position.sourceCount} 个来源。`
  ));
  const activeCount = scoped.holdings.length;

  return positionLines.length
    ? formatStructuredAnswer([
      ["结论", [`你已经确认了 ${activeCount} 条投研记录，聚合后主要看到这些标的。`]],
      ["依据", positionLines],
      ["需要复核", ["这些结论只代表已确认的投研记录，不包含外部实时信息。"]],
      ["资料缺口", ["如果某个标的没有出现，通常是因为还没有录入或确认相关资料。"]],
      ["可继续追问", ["可以指定一个标的问“为什么会关注它？”或“最近有什么变化？”。"]]
    ])
    : buildMissingDataAnswer([]);
}

function buildMissingDataAnswer(tickers: string[]) {
  const target = tickers.length ? tickers.join(" / ") : "这个问题";

  return formatStructuredAnswer([
    ["结论", [`当前已整理资料中没有找到 ${target} 的相关记录。`]],
    ["依据", ["本次查询没有命中可引用的已确认资料。"]],
    ["需要复核", ["这不是投资判断，只表示你目前整理的资料里暂时没有足够依据。"]],
    ["资料缺口", ["请先录入相关 KOL 观点、13F、截图或研究笔记，并在录入页加入资料库。"]],
    ["可继续追问", ["可以换一个已录入的标的，或先去录入资料后再回来查询。"]]
  ]);
}

function formatStructuredAnswer(sections: Array<[string, string[]]>) {
  return sections
    .filter(([, lines]) => lines.length > 0)
    .map(([title, lines]) => `${title}：\n${lines.join("\n")}`)
    .join("\n\n");
}

function buildContextSummary(scoped: ReturnType<typeof scopeData>) {
  const positions = scoped.positions.slice(0, 8).map((position) => (
    `- ${position.ticker}: 聚合方向=${position.netStance}; 最新动作=${position.latestAction}; 来源数=${position.sourceCount}; 确认事件数=${position.eventCount}; 更新时间=${formatDate(position.lastUpdated)}`
  ));
  const holdings = scoped.holdings.slice(0, 8).map((holding) => (
    `- ${holding.ticker}: 动作=${holding.lastAction}; 状态=${holding.status}; 来源=${displaySource(holding.source, holding.sourceName)}; 来源类型=${holding.sourceType ?? ""}; 报告期=${holding.reportingPeriod ?? ""}; 来源记录=${holding.sourceIngestItemId}; 更新时间=${formatDate(holding.updatedAt)}`
  ));
  const events = scoped.events
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((event) => (
      `- ${event.ticker}: ${event.action}; 时间=${formatDate(event.createdAt)}; 摘要=${event.summary}; 来源记录=${event.ingestItemId}`
    ));
  const ingestItems = scoped.ingestItems.slice(0, 8).map((item) => (
    `- ${item.id}: ticker=${item.ticker}; 类型=${item.sourceType ?? item.kind}; 状态=${item.status}; 来源=${displaySource(item.source, item.sourceName)}; 资料日期=${item.publishedAt ?? ""}; 报告期=${item.reportingPeriod ?? ""}; 原文摘要=${summarize(textForAnswerLayer(item.rawText))}`
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

function extractRequestedTickerTokens(query: string) {
  const ignored = new Set(["RAG", "API", "OCR", "SEC", "URL", "LLM", "AI", "KOL", "ETF"]);
  const tokens = query.toUpperCase().match(/\b[A-Z]{2,5}(?:\.[A-Z]{2})?\b/g) ?? [];

  return [...new Set(tokens.filter((token) => !ignored.has(token)))];
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
    ticker: position.ticker,
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
    ticker: holding.ticker,
    sourceIngestItemId: holding.sourceIngestItemId,
    title: `Holding ${holding.ticker}`,
    text: [
      `ticker=${holding.ticker}`,
      `action=${holding.lastAction}`,
      `status=${holding.status}`,
      `source=${displaySource(holding.source, holding.sourceName)}`,
      `sourceType=${holding.sourceType ?? ""}`,
      `publishedAt=${holding.publishedAt ?? ""}`,
      `reportingPeriod=${holding.reportingPeriod ?? ""}`,
      `sourceIngestItemId=${holding.sourceIngestItemId}`
    ].join("\n")
  };
}

function eventToDocument(event: HoldingEvent): RagDocument {
  return {
    id: `RAG-HEV-${event.id}`,
    entityType: "holding_event",
    entityId: event.id,
    ticker: event.ticker,
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
    ticker: item.ticker,
    sourceIngestItemId: item.id,
    title: `Source ${item.ticker} ${item.id}`,
    text: [
      `source=${displaySource(item.source, item.sourceName)}`,
      `sourceType=${item.sourceType ?? ""}`,
      `publishedAt=${item.publishedAt ?? ""}`,
      `reportingPeriod=${item.reportingPeriod ?? ""}`,
      `kind=${item.kind}`,
      `status=${item.status}`,
      `ticker=${item.ticker}`,
      `rawText=${textForAnswerLayer(item.rawText)}`,
      `extractionSummary=${item.extractionSummary ?? ""}`
    ].join("\n")
  };
}

function candidateToDocument(candidate: ExtractionCandidate): RagDocument {
  return {
    id: `RAG-EXT-${candidate.id}`,
    entityType: "extraction_candidate",
    entityId: candidate.id,
    ticker: candidate.ticker,
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

function displaySource(source: string, sourceName?: string) {
  if (sourceName) return sourceName;
  if (source.startsWith("storage://")) return "截图上传";
  return source;
}

function sourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    kol_post: "KOL 观点",
    filing: "机构持仓文件",
    research: "研究资料",
    personal_note: "个人笔记",
    screenshot: "截图",
    text: "文本",
    link: "链接"
  };

  return labels[type] ?? type;
}

function textForAnswerLayer(text: string) {
  return text
    .replace(/Image uploaded:[^\n]*/gi, "截图资料")
    .replace(/storage:\/\/\S+/gi, "截图上传")
    .replace(/\n?Storage object:\s*\S+/gi, "")
    .replace(/\n?Reviewer note:[^\n]*/gi, "");
}

function summarize(text: string) {
  return text
    .replace(/(?:confidence|avgConfidence)=\d+(?:\.\d+)?/gi, "")
    .replace(/平均置信度\s*\d+(?:\.\d+)?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}
