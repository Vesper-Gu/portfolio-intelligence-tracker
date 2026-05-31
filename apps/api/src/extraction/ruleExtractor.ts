import type { ExtractionProvider, ExtractionStatus, IngestItem, SignalAction } from "@pit/shared";

export interface ExtractionCandidate {
  provider: ExtractionProvider;
  ticker: string;
  action: SignalAction;
  confidence: string;
  summary: string;
  status?: ExtractionStatus;
  fallbackUsed?: boolean;
  retryable?: boolean;
  providerError?: string;
}

const knownTickers = ["NVDA", "TSLA", "MSTR", "SMH", "AMD", "BTC", "ETH", "AAPL"];
const ignoredUppercaseTerms = new Set(["AI", "API", "OCR", "SEC", "URL", "PNG", "JPEG", "WEBP", "UNKNOWN"]);

export function extractIngestCandidate(item: IngestItem): ExtractionCandidate {
  const corpus = `${item.source}\n${item.fileName ?? ""}\n${item.rawText}`.toUpperCase();
  const ticker = findKnownTicker(corpus)
    ?? item.extractedTicker
    ?? (item.ticker !== "UNKNOWN" ? item.ticker : findTicker(corpus))
    ?? "UNKNOWN";
  const action = inferAction(corpus);
  const confidence = inferConfidence(item, ticker, action);
  const summary = buildSummary(item, ticker, action, confidence);

  return {
    provider: "rule_v1",
    ticker,
    action,
    confidence,
    summary,
    status: "success",
    fallbackUsed: false,
    retryable: false
  };
}

function findTicker(corpus: string) {
  const known = findKnownTicker(corpus);

  if (known) {
    return known;
  }

  const candidates = corpus.match(/\b[A-Z]{2,5}(?:\.[A-Z]{2})?\b/g) ?? [];
  return candidates.find((candidate) => !ignoredUppercaseTerms.has(candidate));
}

function findKnownTicker(corpus: string) {
  return knownTickers.find((ticker) => corpus.includes(ticker));
}

function inferAction(corpus: string): SignalAction {
  if (/(ADDED|ADD|INCREASE|BOUGHT|BUY|ACCUMULAT|加仓|增持|买入)/.test(corpus)) {
    return "加仓";
  }

  if (/(REDUCE|REDUCED|TRIM|SELL|SOLD|CUT|减仓|卖出|降低)/.test(corpus)) {
    return "减仓";
  }

  if (/(NEW POSITION|NEW LINE|OPENED|INITIATED|新建仓|建仓|新增)/.test(corpus)) {
    return "新建仓";
  }

  if (/(RISK|CONFLICT|LOW CONFIDENCE|低置信|冲突|风险)/.test(corpus)) {
    return "风险";
  }

  if (/(HOLD|UNCHANGED|持有|不变)/.test(corpus)) {
    return "持有";
  }

  return "观察";
}

function inferConfidence(item: IngestItem, ticker: string, action: SignalAction) {
  if (ticker !== "UNKNOWN" && action !== "观察") {
    return "0.82";
  }

  if (item.kind === "screenshot") {
    return item.storageObjectKey ? "0.58" : "0.52";
  }

  if (ticker !== "UNKNOWN") {
    return "0.68";
  }

  return "0.42";
}

function buildSummary(item: IngestItem, ticker: string, action: SignalAction, confidence: string) {
  if (item.kind === "screenshot" && item.storageObjectKey) {
    return `图片已归档到 Supabase Storage。规则解析暂未读取图像内容，候选 ticker=${ticker}，action=${action}，confidence=${confidence}；需要 OCR/Vision 或人工确认。`;
  }

  if (ticker === "UNKNOWN") {
    return `未从文本中稳定识别 ticker。候选 action=${action}，confidence=${confidence}；需要人工补充标的。`;
  }

  return `从录入内容中识别候选 ticker=${ticker}，action=${action}，confidence=${confidence}。结果只进入人工确认队列，不写入正式 holdings。`;
}
