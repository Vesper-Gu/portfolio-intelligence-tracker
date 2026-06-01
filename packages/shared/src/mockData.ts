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
  { label: "@Investor_X", cells: ["positive", "empty", "warning", "empty", "positive", "negative", "empty", "neutral"] },
  { label: "@TechFund_A", cells: ["positive", "warning", "empty", "positive", "positive", "empty", "warning", "empty"] },
  { label: "@Macro_Z", cells: ["warning", "positive", "negative", "empty", "empty", "negative", "positive", "neutral"] },
  { label: "Sample Fund 13F", cells: ["positive", "empty", "negative", "positive", "positive", "empty", "empty", "warning"] },
  { label: "Research Notes", cells: ["positive", "warning", "empty", "positive", "positive", "negative", "positive", "empty"] },
  { label: "Screenshot Queue", cells: ["empty", "empty", "empty", "empty", "empty", "negative", "empty", "empty"] }
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
    rawText: "@Investor_X: Added to NVDA again after earnings. AI backlog still underestimated. Watch cloud capex pull-forward, but current demand still supports adding exposure."
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
    rawText: "Terminal screenshot OCR: MSTR position flagged as risk. Weight field conflicts with total asset row and BTC proxy exposure needs manual review."
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
    rawText: "Sample Fund 13F: New SMH line item appears in latest quarterly filing. Semiconductor ETF exposure added as a basket position."
  },
  {
    id: "ING-1027",
    source: "@TechFund_A newsletter",
    sourceName: "@TechFund_A",
    sourceType: "research_article",
    publishedAt: "2026-05-16",
    kind: "text",
    ticker: "AMD",
    confidence: "0.88",
    status: "可接受",
    rawText: "@TechFund_A newsletter: AMD supply chain checks improved, AI accelerator backlog appears stronger than expected. Action: add on pullbacks."
  },
  {
    id: "ING-1028",
    source: "@Macro_Z 推文",
    sourceName: "@Macro_Z",
    sourceType: "kol_post",
    publishedAt: "2026-05-18",
    kind: "text",
    ticker: "TSLA",
    confidence: "0.82",
    status: "可接受",
    rawText: "@Macro_Z: Trimmed TSLA after delivery revisions and margin pressure. Keeping it on watchlist until margin trend stabilizes."
  },
  {
    id: "ING-1029",
    source: "个人研究笔记",
    sourceName: "Research Notes",
    sourceType: "personal_note",
    publishedAt: "2026-05-19",
    kind: "text",
    ticker: "BTC",
    confidence: "0.86",
    status: "可接受",
    rawText: "Personal research note: BTC remains a hold. ETF flows are steady, but position size should not increase until volatility cools."
  },
  {
    id: "ING-1030",
    source: "Substack crypto cycle note",
    sourceName: "@TechFund_A",
    sourceType: "research_article",
    publishedAt: "2026-05-20",
    kind: "link",
    ticker: "ETH",
    confidence: "0.84",
    status: "可接受",
    rawText: "Substack crypto cycle note: ETH staking flows and L2 fee growth remain constructive. Maintain current exposure; no aggressive add yet."
  },
  {
    id: "ING-1031",
    source: "13F amendment note",
    sourceName: "Sample Fund 13F",
    sourceType: "fund_filing",
    publishedAt: "2026-05-21",
    reportingPeriod: "2026 Q1/A",
    kind: "filing",
    ticker: "AAPL",
    confidence: "0.78",
    status: "待复核",
    rawText: "13F amendment note: AAPL position unchanged; observation only. Needs confirmation because amendment file was partial."
  },
  {
    id: "ING-1032",
    source: "@Investor_X thread",
    sourceName: "@Investor_X",
    sourceType: "kol_post",
    publishedAt: "2026-05-22",
    kind: "text",
    ticker: "MSFT",
    confidence: "0.87",
    status: "可接受",
    rawText: "@Investor_X: MSFT remains a core AI infrastructure holding. No fresh add, but keeping position because Azure AI demand still compounds."
  },
  {
    id: "ING-1033",
    source: "@Macro_Z macro basket",
    sourceName: "@Macro_Z",
    sourceType: "kol_post",
    publishedAt: "2026-05-22",
    kind: "text",
    ticker: "GOOGL",
    confidence: "0.80",
    status: "可接受",
    rawText: "@Macro_Z: Watching GOOGL for AI search margin pressure. Observation only until ad growth and capex trade-off becomes clearer."
  },
  {
    id: "ING-1034",
    source: "Cloud infrastructure screenshot",
    sourceName: "Screenshot Queue",
    sourceType: "screenshot",
    publishedAt: "2026-05-23",
    kind: "screenshot",
    ticker: "NET",
    confidence: "0.76",
    status: "可接受",
    rawText: "Screenshot note: NET mentioned as a Cloudflare watchlist add after comments from a well-known fund manager. Action: observe before adding."
  },
  {
    id: "ING-1035",
    source: "Sample Fund 13F",
    sourceName: "Sample Fund 13F",
    sourceType: "fund_filing",
    publishedAt: "2026-05-23",
    reportingPeriod: "2026 Q1",
    kind: "filing",
    ticker: "MSFT",
    confidence: "0.89",
    status: "可接受",
    rawText: "Sample Fund 13F: MSFT remains a top five holding. Position unchanged versus previous quarter."
  },
  {
    id: "ING-1036",
    source: "Research Notes",
    sourceName: "Research Notes",
    sourceType: "personal_note",
    publishedAt: "2026-05-24",
    kind: "text",
    ticker: "NVDA",
    confidence: "0.84",
    status: "可接受",
    rawText: "Research note: NVDA thesis still supported by AI server demand, but valuation stretch means position should be added only after pullback."
  },
  {
    id: "ING-1037",
    source: "@TechFund_A AI software note",
    sourceName: "@TechFund_A",
    sourceType: "research_article",
    publishedAt: "2026-05-24",
    kind: "link",
    ticker: "META",
    confidence: "0.83",
    status: "可接受",
    rawText: "@TechFund_A AI software note: META open-source model strategy increases engagement optionality. New position candidate if capex guidance stays controlled."
  },
  {
    id: "ING-1038",
    source: "@Macro_Z risk update",
    sourceName: "@Macro_Z",
    sourceType: "kol_post",
    publishedAt: "2026-05-24",
    kind: "text",
    ticker: "MSTR",
    confidence: "0.79",
    status: "可接受",
    rawText: "@Macro_Z risk update: MSTR remains a high beta BTC proxy. Reduce exposure if BTC volatility breaks above risk budget."
  },
  {
    id: "ING-1039",
    source: "13F sector rotation memo",
    sourceName: "Sample Fund 13F",
    sourceType: "fund_filing",
    publishedAt: "2026-05-25",
    reportingPeriod: "2026 Q1",
    kind: "filing",
    ticker: "AMD",
    confidence: "0.81",
    status: "可接受",
    rawText: "13F sector rotation memo: AMD position increased modestly while broad semiconductor exposure stayed stable."
  },
  {
    id: "ING-1040",
    source: "个人研究笔记",
    sourceName: "Research Notes",
    sourceType: "personal_note",
    publishedAt: "2026-05-25",
    kind: "text",
    ticker: "TSLA",
    confidence: "0.73",
    status: "需人工确认",
    rawText: "Personal note: TSLA may be worth revisiting after margin stabilization, but current evidence conflicts with Macro_Z trim signal."
  },
  {
    id: "ING-1041",
    source: "@Investor_X crypto comment",
    sourceName: "@Investor_X",
    sourceType: "kol_post",
    publishedAt: "2026-05-25",
    kind: "text",
    ticker: "BTC",
    confidence: "0.82",
    status: "可接受",
    rawText: "@Investor_X crypto comment: BTC should remain a core hold, but no new add while ETF inflow momentum is slowing."
  },
  {
    id: "ING-1042",
    source: "L2 ecosystem note",
    sourceName: "Research Notes",
    sourceType: "personal_note",
    publishedAt: "2026-05-26",
    kind: "text",
    ticker: "ETH",
    confidence: "0.80",
    status: "可接受",
    rawText: "L2 ecosystem note: ETH exposure stays unchanged. Fee growth is improving, but staking yield spread is not enough for add."
  },
  {
    id: "ING-1043",
    source: "Screenshot queue",
    sourceName: "Screenshot Queue",
    sourceType: "screenshot",
    publishedAt: "2026-05-26",
    kind: "screenshot",
    ticker: "GOOGL",
    confidence: "0.57",
    status: "需人工确认",
    rawText: "Screenshot OCR: GOOGL highlighted in a margin pressure chart, but source row is partially cropped. Needs manual confirmation."
  },
  {
    id: "ING-1044",
    source: "@TechFund_A ETF note",
    sourceName: "@TechFund_A",
    sourceType: "research_article",
    publishedAt: "2026-05-26",
    kind: "link",
    ticker: "SMH",
    confidence: "0.85",
    status: "可接受",
    rawText: "@TechFund_A ETF note: SMH remains the cleanest way to hold semiconductor breadth while single-name valuations are stretched."
  },
  {
    id: "ING-1045",
    source: "AAPL product cycle note",
    sourceName: "Research Notes",
    sourceType: "personal_note",
    publishedAt: "2026-05-27",
    kind: "text",
    ticker: "AAPL",
    confidence: "0.74",
    status: "可接受",
    rawText: "AAPL product cycle note: Keep AAPL on observation. No add until AI device cycle evidence appears in channel checks."
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
    name: "@Macro_Z",
    platform: "X",
    type: "KOL",
    status: "正常",
    lastSync: "2026-05-18",
    records: 19,
    parser: "tweet_risk_signal_v1"
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
    name: "Research Notes",
    platform: "App",
    type: "个人笔记",
    status: "正常",
    lastSync: "2026-05-20",
    records: 22,
    parser: "personal_note_v1"
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
