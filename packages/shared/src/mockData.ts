import type {
  DashboardPayload,
  EvidenceItem,
  HeatmapRow,
  HoldingSignal,
  IngestItem,
  QualitySummary,
  SourceItem,
  TickerMove
} from "./schemas.js";

export const tickerMoves: TickerMove[] = [
  { symbol: "SPX", change: "+0.42%", tone: "positive" },
  { symbol: "NDX", change: "+0.91%", tone: "positive" },
  { symbol: "NVDA", change: "+2.18%", tone: "positive" },
  { symbol: "TSLA", change: "-1.04%", tone: "negative" },
  { symbol: "BTC", change: "+3.22%", tone: "positive" },
  { symbol: "ETH", change: "+1.46%", tone: "positive" },
  { symbol: "VIX", change: "-4.10%", tone: "negative" },
  { symbol: "DXY", change: "+0.08%", tone: "positive" }
];

export const holdingSignals: HoldingSignal[] = [
  {
    ticker: "NVDA",
    action: "加仓",
    kolCount: 8,
    delta: "+4.2%",
    avgWeight: "24.6%",
    source: "推文",
    evidence: "@Investor_X 2026-05-12",
    verified: "98%",
    tone: "positive"
  },
  {
    ticker: "BTC",
    action: "持有",
    kolCount: 6,
    delta: "0.0%",
    avgWeight: "18.2%",
    source: "截图",
    evidence: "@TechFund_A 今日",
    verified: "94%",
    tone: "positive"
  },
  {
    ticker: "TSLA",
    action: "减仓",
    kolCount: 5,
    delta: "-2.8%",
    avgWeight: "8.1%",
    source: "备注",
    evidence: "@Macro_Z 2026-05-08",
    verified: "72%",
    tone: "negative"
  },
  {
    ticker: "SMH",
    action: "新建仓",
    kolCount: 4,
    delta: "+1.9%",
    avgWeight: "12.7%",
    source: "13F",
    evidence: "SEC 13F 抓取",
    verified: "91%",
    tone: "positive"
  },
  {
    ticker: "AMD",
    action: "加仓",
    kolCount: 4,
    delta: "+0.8%",
    avgWeight: "7.4%",
    source: "文章",
    evidence: "Substack 片段",
    verified: "83%",
    tone: "positive"
  },
  {
    ticker: "MSTR",
    action: "风险",
    kolCount: 3,
    delta: "-3.4%",
    avgWeight: "5.9%",
    source: "终端",
    evidence: "低置信 OCR",
    verified: "需确认",
    tone: "negative"
  },
  {
    ticker: "ETH",
    action: "持有",
    kolCount: 3,
    delta: "0.0%",
    avgWeight: "9.6%",
    source: "手动",
    evidence: "用户录入",
    verified: "100%",
    tone: "positive"
  },
  {
    ticker: "AAPL",
    action: "观察",
    kolCount: 2,
    delta: "-0.2%",
    avgWeight: "6.2%",
    source: "13F",
    evidence: "旧快照",
    verified: "76%",
    tone: "neutral"
  }
];

export const evidenceItems: EvidenceItem[] = [
  {
    label: "证据 1",
    source: "@Investor_X",
    detail: "2026-05-12 加仓 +4.2%",
    tone: "positive"
  },
  {
    label: "证据 2",
    source: "SEC 13F",
    detail: "2026-05-01 新增 SMH/NVDA",
    tone: "positive"
  },
  {
    label: "证据 3",
    source: "OCR 队列",
    detail: "今日 MSTR 需确认",
    tone: "negative"
  }
];

export const heatmapColumns = ["NVDA", "BTC", "TSLA", "SMH", "AMD", "MSTR", "ETH", "AAPL"];

export const heatmapRows: HeatmapRow[] = [
  { label: "Inv_X", cells: ["negative", "negative", "neutral", "warning", "warning", "positive", "negative", "negative"] },
  { label: "Tech_A", cells: ["warning", "positive", "positive", "negative", "negative", "neutral", "warning", "warning"] },
  { label: "Macro_Z", cells: ["neutral", "warning", "warning", "positive", "positive", "negative", "negative", "neutral"] },
  { label: "13F", cells: ["negative", "negative", "neutral", "warning", "warning", "positive", "negative", "negative"] },
  { label: "Manual", cells: ["positive", "positive", "negative", "neutral", "warning", "warning", "positive", "positive"] },
  { label: "Watch", cells: ["warning", "warning", "positive", "positive", "negative", "negative", "neutral", "warning"] }
];

export const ingestItems: IngestItem[] = [
  {
    id: "ING-1024",
    source: "@Investor_X 推文",
    sourceName: "@Investor_X",
    sourceType: "kol_post",
    publishedAt: "2026-05-12",
    kind: "text",
    ticker: "NVDA",
    confidence: "0.98",
    status: "可接受",
    rawText: "Added to NVDA again after earnings. AI backlog still underestimated."
  },
  {
    id: "ING-1025",
    source: "Terminal OCR",
    sourceName: "Terminal OCR",
    sourceType: "screenshot",
    publishedAt: "2026-05-20",
    kind: "screenshot",
    ticker: "MSTR",
    confidence: "0.54",
    status: "需人工确认",
    rawText: "OCR detected MSTR position but weight field conflicts with total asset row."
  },
  {
    id: "ING-1026",
    source: "SEC 13F",
    sourceName: "Sample Fund 13F",
    sourceType: "fund_filing",
    publishedAt: "2026-05-15",
    reportingPeriod: "2026 Q1",
    kind: "filing",
    ticker: "SMH",
    confidence: "0.91",
    status: "待复核",
    rawText: "New SMH line item appears in latest quarterly filing."
  }
];

export const sources: SourceItem[] = [
  {
    name: "@Investor_X",
    platform: "X",
    type: "KOL",
    status: "正常",
    lastSync: "2026-05-12",
    records: 41,
    parser: "tweet_position_v1"
  },
  {
    name: "@TechFund_A",
    platform: "Substack",
    type: "KOL",
    status: "正常",
    lastSync: "2026-05-10",
    records: 28,
    parser: "article_position_v1"
  },
  {
    name: "SEC 13F",
    platform: "SEC",
    type: "文件",
    status: "正常",
    lastSync: "2026-05-01",
    records: 119,
    parser: "filing_13f_v1"
  },
  {
    name: "手动录入",
    platform: "App",
    type: "私有",
    status: "正常",
    lastSync: "今日",
    records: 36,
    parser: "manual_entry"
  },
  {
    name: "新闻索引",
    platform: "RSS",
    type: "新闻",
    status: "规划",
    lastSync: "待上线",
    records: 0,
    parser: "phase_3_news"
  }
];

export const qualitySummary: QualitySummary = {
  pendingReview: 3,
  lowConfidenceFields: 1,
  verifiedToday: 7,
  lastUpdated: "2026-05-20T00:00:00+08:00"
};

export const dashboardPayload: DashboardPayload = {
  tickerMoves,
  holdingSignals,
  evidenceItems,
  heatmapColumns,
  heatmapRows,
  qualitySummary
};
