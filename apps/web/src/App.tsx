import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import {
  dashboardPayload as fallbackDashboardPayload,
  sources as fallbackSources,
  type DashboardPayload,
  type CreateIngestItemRequest,
  type ExtractionCandidate,
  type HoldingEvent,
  type HoldingRecord,
  type IngestItem,
  type IngestStatus,
  type PortfolioPosition,
  type QualityEvent,
  type RagQueryResponse,
  type ResearchSourceType,
  type SignalAction,
  type SourceItem,
  type Tone,
  type ViewKey
} from "./mockData";
import {
  acceptIngestItem,
  archiveHolding,
  createExtractionCandidate,
  createIngestItem,
  deleteAccountData,
  deleteExtractionCandidate,
  extractIngestItem,
  exportAccountData,
  fetchDashboardPayload,
  fetchExtractionCandidates,
  fetchHoldings,
  fetchHoldingEvents,
  fetchIngestItem,
  fetchIngestImageUrl,
  fetchIngestItems,
  fetchPortfolioPositions,
  fetchQualityEvents,
  fetchSources,
  queryRag,
  rejectIngestItem,
  uploadIngestImage,
  updateExtractionCandidate,
  updateIngestItem,
  updateSource
} from "./api";
import { getCurrentSession, isExternalAuthEnabled, signIn, signOut, subscribeToSession } from "./auth";
import { setAccessToken } from "./api";

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "首页" },
  { key: "distribution", label: "分布" },
  { key: "ingest", label: "录入" },
  { key: "library", label: "标的资料库" },
  { key: "rag", label: "问资料库" },
  { key: "settings", label: "账户" }
];
const publicDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

const toneClass: Record<Tone, string> = {
  positive: "tone-positive",
  negative: "tone-negative",
  warning: "tone-warning",
  neutral: "tone-neutral",
  empty: "tone-empty"
};

const researchSourceOptions: Array<{ value: ResearchSourceType; label: string }> = [
  { value: "kol_post", label: "KOL 推文" },
  { value: "fund_filing", label: "基金披露 / 13F" },
  { value: "research_article", label: "研究文章" },
  { value: "personal_note", label: "个人笔记" },
  { value: "screenshot", label: "截图资料" },
  { value: "other", label: "其他" }
];

const signalActionOptions: SignalAction[] = ["观察", "新建仓", "加仓", "持有", "减仓", "风险"];
const tickerPalette = [
  "#7aa7c7",
  "#68b889",
  "#d4a45f",
  "#c97872",
  "#8d86c9",
  "#65bdb4",
  "#bfb56a",
  "#b983b6",
  "#7f9fd2",
  "#c58d62"
];

const tickerBrandMap: Record<string, { name: string; mark: string; accent: string }> = {
  AAPL: { name: "Apple", mark: "A", accent: "#b7c0c9" },
  AMD: { name: "Advanced Micro Devices", mark: "AMD", accent: "#ef6f64" },
  BTC: { name: "Bitcoin", mark: "₿", accent: "#f2a33a" },
  ETH: { name: "Ethereum", mark: "Ξ", accent: "#8b9dff" },
  GOOGL: { name: "Alphabet", mark: "G", accent: "#78b8d6" },
  META: { name: "Meta Platforms", mark: "∞", accent: "#6ea8ff" },
  MSFT: { name: "Microsoft", mark: "M", accent: "#75c97a" },
  MSTR: { name: "MicroStrategy", mark: "M", accent: "#f2a33a" },
  NET: { name: "Cloudflare", mark: "NET", accent: "#f08b4f" },
  NVDA: { name: "NVIDIA", mark: "N", accent: "#8fd16a" },
  SMH: { name: "VanEck Semiconductor ETF", mark: "SMH", accent: "#72d1c8" },
  TSLA: { name: "Tesla", mark: "T", accent: "#f07d75" }
};

const emptyAnalysisDashboardPayload: DashboardPayload = {
  ...fallbackDashboardPayload,
  tickerMoves: [],
  holdingSignals: [],
  evidenceItems: [],
  heatmapColumns: [],
  heatmapRows: []
};

const ingestStatusTone: Record<IngestStatus, Tone> = {
  "可接受": "positive",
  "需人工确认": "negative",
  "待复核": "warning",
  "已接受": "positive",
  "已驳回": "negative",
  "已修改": "warning",
  "已存档": "neutral"
};

function actionTone(action: string): Tone {
  if (action === "加仓" || action === "新建仓" || action === "持有") return "positive";
  if (action === "减仓" || action === "风险") return "negative";
  return "neutral";
}

function stanceTone(stance: PortfolioPosition["netStance"]): Tone {
  if (stance === "看多") return "positive";
  if (stance === "看空") return "negative";
  return "warning";
}

function tickerBrand(ticker: string) {
  return tickerBrandMap[ticker.toUpperCase()] ?? {
    name: `${ticker.toUpperCase()} 资料`,
    mark: ticker.toUpperCase().slice(0, 3),
    accent: "#78b8d6"
  };
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSourceType(sourceType?: ResearchSourceType) {
  return researchSourceOptions.find((option) => option.value === sourceType)?.label ?? "未分类";
}

function sourceDisplayName(item: Pick<IngestItem, "source" | "sourceName">) {
  return item.sourceName ?? formatSourceForUser(item.source);
}

function describeCandidateStatus(candidate: ExtractionCandidate) {
  if (candidate.provider === "vision_llm" && candidate.status === "success") return "Vision 成功";
  if (candidate.fallbackUsed && candidate.retryable) return "服务繁忙，可重试";
  if (candidate.fallbackUsed) return "已回落到规则解析";
  if (candidate.status === "success") return "解析成功";
  return "待确认";
}

function candidateStatusTone(candidate: ExtractionCandidate): Tone {
  if (candidate.provider === "vision_llm" && candidate.status === "success") return "positive";
  if (candidate.fallbackUsed && candidate.retryable) return "warning";
  if (candidate.fallbackUsed) return "negative";
  return "neutral";
}

function normalizeEditableConfidence(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return "0.50";

  return Math.min(1, Math.max(0, parsed)).toFixed(2);
}

function normalizeEditableTicker(value: string) {
  return value.trim().toUpperCase();
}

function isValidEditableTicker(value: string) {
  const ticker = normalizeEditableTicker(value);
  return ticker !== "UNKNOWN" && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker);
}

function hideConfidenceText(value: string) {
  return value
    .replace(/(?:confidence|avgConfidence)=\d+(?:\.\d+)?/gi, "")
    .replace(/，?confidence\s*\d+(?:\.\d+)?/gi, "")
    .replace(/，?平均置信度\s*\d+(?:\.\d+)?/g, "")
    .replace(/置信度偏低/g, "需人工复核")
    .replace(/\s+；/g, "；")
    .replace(/，{2,}/g, "，")
    .trim();
}

function formatSourceForUser(source: string) {
  if (source.startsWith("storage://")) return "截图上传";
  if (/^https?:\/\//i.test(source)) return "网页链接";
  return source;
}

function getUserFacingSourceSummary(item: IngestItem) {
  if (item.extractionSummary) return hideConfidenceText(item.extractionSummary);

  if (item.kind === "screenshot") {
    const fileName = item.fileName ? `「${item.fileName}」` : "截图";

    if (item.status === "已接受") {
      return `${fileName}已加入资料库，等待或使用 AI 解析结果生成资料摘要。`;
    }

    return `${fileName}已上传，等待 AI 解析。`;
  }

  return hideConfidenceText(item.rawText)
    .replace(/Reviewer note:.*/gi, "")
    .trim();
}

function getOriginalEvidenceContent(item: IngestItem) {
  if (item.kind === "screenshot") return "该资料以图片形式保存，请查看下方原始图片核验内容。";

  return hideConfidenceText(item.rawText)
    .replace(/\n?Reviewer note:.*/gis, "")
    .replace(/\n?Reject reason:.*/gis, "")
    .replace(/\n?Storage object:.*/gis, "")
    .trim();
}

function formatCitationEntityType(entityType: RagQueryResponse["citations"][number]["entityType"]) {
  const labels: Record<RagQueryResponse["citations"][number]["entityType"], string> = {
    position: "聚合仓位",
    holding: "已入库记录",
    holding_event: "确认事件",
    ingest_item: "来源资料",
    extraction_candidate: "解析候选"
  };

  return labels[entityType];
}

function getUserFacingCitationSnippet(citation: RagQueryResponse["citations"][number]) {
  return hideConfidenceText(citation.snippet)
    .replace(/storage:\/\/\S+/g, "截图上传")
    .replace(/sourceIngestItemId=\S+/g, "来源记录")
    .replace(/ingestItemId=\S+/g, "来源记录")
    .replace(/\bsourceType=\S*/g, "")
    .replace(/\bpublishedAt=\S*/g, "")
    .replace(/\breportingPeriod=\S*/g, "")
    .replace(/\bkind=text/g, "文本资料")
    .replace(/\bkind=link/g, "链接资料")
    .replace(/\bkind=screenshot/g, "截图资料")
    .replace(/\bprovider=rule_v1/g, "规则解析")
    .replace(/\bprovider=deepseek_text/g, "文本模型解析")
    .replace(/\bprovider=vision_llm/g, "图片模型解析")
    .replace(/\brawText=/g, "原文 ")
    .replace(/\bsummary=/g, "摘要 ")
    .replace(/netStance=/g, "方向 ")
    .replace(/latestAction=/g, "最新动作 ")
    .replace(/sources=/g, "来源 ")
    .replace(/updated=/g, "更新 ")
    .replace(/ticker=/g, "标的 ")
    .replace(/action=/g, "动作 ")
    .replace(/status=/g, "状态 ")
    .replace(/source=/g, "来源 ")
    .replace(/\b(?:ING|HEV|HLD)-\d+\b/g, "资料记录")
    .replace(/\s+/g, " ")
    .trim();
}

function getCitationPrimaryTicker(citation: RagQueryResponse["citations"][number]) {
  const text = `${citation.title} ${citation.snippet}`;
  return text.match(/\b[A-Z]{2,5}(?:\.[A-Z]{2})?\b/)?.[0] ?? "资料";
}

function getCitationDisplayTitle(citation: RagQueryResponse["citations"][number]) {
  const ticker = getCitationPrimaryTicker(citation);
  const type = formatCitationEntityType(citation.entityType);

  return ticker === "资料" ? type : `${ticker} · ${type}`;
}

function getCitationEvidenceMeta(citation: RagQueryResponse["citations"][number]) {
  const snippet = citation.snippet;
  const source = snippet.match(/source=([^=]+?)(?:\s+sourceType=|\s+publishedAt=|\s+reportingPeriod=|\s+kind=|\s+status=|$)/)?.[1]?.trim();
  const action = snippet.match(/action=([^\s;]+)/)?.[1]?.trim();
  const date = snippet.match(/(?:publishedAt|updated)=([^\s;]+)/)?.[1]?.trim();
  const parts = [
    source && source !== "截图上传" ? source : undefined,
    action ? `动作 ${action}` : undefined,
    date ? formatShortDate(date) : undefined
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "可追溯资料";
}

function getFollowUpSuggestions(message?: RagChatMessage) {
  const citations = message?.citations ?? [];
  const ticker = citations.map(getCitationPrimaryTicker).find((value) => value !== "资料");

  if (!message || citations.length === 0) {
    return ["我整理过哪些标的？", "最近有什么新变化？", "有什么需要留意的风险？"];
  }

  return [
    ticker ? `为什么会关注 ${ticker}？` : "这个判断来自哪些资料？",
    ticker ? `${ticker} 最近有什么变化？` : "最近有什么变化？",
    ticker ? `${ticker} 有什么需要留意？` : "有什么需要留意的风险？"
  ];
}

function renderChatContent(message: RagChatMessage) {
  if (message.role === "user") {
    return message.content.split("\n").map((line, index) => (
      <p key={`${message.id}-${index}`}>{line}</p>
    ));
  }

  const blocks = message.content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks.map((block, index) => {
    const [firstLine, ...rest] = block.split("\n");
    const sectionMatch = firstLine.match(/^(结论|依据|需要复核|资料缺口|可继续追问|最近变化|来源追溯)：\s*(.*)$/);

    if (!sectionMatch) {
      return (
        <div className="answer-section plain" key={`${message.id}-block-${index}`}>
          {block.split("\n").map((line, lineIndex) => (
            <p key={`${message.id}-plain-${index}-${lineIndex}`}>{line}</p>
          ))}
        </div>
      );
    }

    const [, title, inlineText] = sectionMatch;
    const lines = [inlineText, ...rest].map((line) => line.trim()).filter(Boolean);

    return (
      <div className="answer-section" key={`${message.id}-section-${title}-${index}`}>
        <strong>{title}</strong>
        {lines.length ? lines.map((line, lineIndex) => (
          <p className={line.startsWith("- ") ? "answer-bullet" : undefined} key={`${message.id}-${title}-${lineIndex}`}>
            {line.replace(/^- /, "")}
          </p>
        )) : null}
      </div>
    );
  });
}

type NewIngestMode = CreateIngestItemRequest["kind"];
const signalActions: SignalAction[] = ["加仓", "持有", "减仓", "新建仓", "风险", "观察"];

interface RagChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: RagQueryResponse["citations"];
  generatedAt?: string;
  answerMode?: RagQueryResponse["answerMode"];
}

interface SelectedImageFile {
  file: File;
  name: string;
  size: number;
  type: string;
}

export function App() {
  const externalAuth = isExternalAuthEnabled();
  const [authReady, setAuthReady] = useState(!externalAuth);
  const [session, setSession] = useState<{ token: string; email: string } | null>(null);
  const [workspaceStarted, setWorkspaceStarted] = useState(false);

  useEffect(() => {
    if (!externalAuth) {
      setAccessToken(null);
      return;
    }

    let unsubscribe = () => {};
    let active = true;

    getCurrentSession().then(async (currentSession) => {
      if (!active) return;
      setAccessToken(currentSession?.access_token ?? null);
      setSession(currentSession ? { token: currentSession.access_token, email: currentSession.user.email ?? currentSession.user.id } : null);
      setAuthReady(true);
      const removeListener = await subscribeToSession((nextSession) => {
        if (!active) return;
        setAccessToken(nextSession?.access_token ?? null);
        setSession(nextSession ? { token: nextSession.access_token, email: nextSession.user.email ?? nextSession.user.id } : null);
        setAuthReady(true);
      });
      if (active) unsubscribe = removeListener;
      else removeListener();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [externalAuth]);

  if (!authReady) return <AuthLoadingView />;
  if (!workspaceStarted) return <LandingPage onStart={() => setWorkspaceStarted(true)} />;
  if (externalAuth && !session) return <LoginView onSignedIn={(token, email) => {
    setAccessToken(token);
    setSession({ token, email });
  }} />;

  return (
    <WorkspaceApp
      accountLabel={session?.email ?? (publicDemoMode ? "匿名演示会话" : "本地开发用户")}
      onSignOut={externalAuth ? async () => {
        await signOut();
        setAccessToken(null);
        setSession(null);
      } : undefined}
    />
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setIntroDone(true), reduceMotion ? 900 : 4650);
    return () => window.clearTimeout(timer);
  }, []);

  function scrollToExample() {
    document.getElementById("landing-example")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="landing-shell">
      {!introDone && <LandingIntro onSkip={() => setIntroDone(true)} />}
      <nav className="landing-nav" aria-label="官网导航">
        <div className="landing-brand">
          <span>持仓图谱</span>
          <strong>Portfolio Intelligence</strong>
        </div>
        <div className="landing-nav-links">
          <a href="#landing-features">怎么用</a>
          <a href="#landing-example">示例</a>
          <a href="https://github.com/Vesper-Gu/portfolio-intelligence-tracker" rel="noreferrer" target="_blank">GitHub</a>
          <button onClick={onStart} type="button">开始使用</button>
        </div>
      </nav>

      <section className="landing-hero">
        <LandingMarketBackdrop />
        <div className="landing-hero-copy">
          <span className="landing-kicker">Portfolio intelligence</span>
          <h1>
            市场信息，变成持仓判断。
          </h1>
          <p>粘贴研报、帖子和笔记，提取标的、观点和来源。</p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={onStart} type="button">开始使用</button>
            <button className="landing-secondary" onClick={scrollToExample} type="button">查看示例</button>
          </div>
        </div>

        <LandingProductPreview />
      </section>

      <section className="landing-proof-strip" aria-label="产品边界">
        <span>公开 Demo 可试用</span>
        <span>每条结论保留来源</span>
        <span>只整理资料，不做买卖建议</span>
      </section>

      <LandingCaseDashboard />

      <section className="landing-final-cta">
        <span>从第一条资料开始</span>
        <h2>把市场信息整理成持仓判断。</h2>
        <p>先导入资料；系统整理完成后，重点标的和观点变化会自然浮现。</p>
        <button onClick={onStart} type="button">开始使用</button>
      </section>
    </main>
  );
}

const landingIntroFragments = [
  { type: "social", text: "TSLA margins keep compressing", x: "-18%", y: "8%", dx: "49vw", dy: "24vh", rotate: "-14deg" },
  { type: "report", text: "Q3 Semiconductor Fund Letter", x: "12%", y: "-18%", dx: "33vw", dy: "36vh", rotate: "9deg" },
  { type: "ticker", text: "$AMD · add on weakness", x: "82%", y: "-12%", dx: "-34vw", dy: "35vh", rotate: "-8deg" },
  { type: "social", text: "BTC ETF flows rebound", x: "108%", y: "12%", dx: "-47vw", dy: "25vh", rotate: "13deg" },
  { type: "report", text: "AI infra capex revision", x: "-16%", y: "34%", dx: "42vw", dy: "8vh", rotate: "7deg" },
  { type: "ticker", text: "NVDA supply chain note", x: "102%", y: "42%", dx: "-43vw", dy: "3vh", rotate: "-11deg" },
  { type: "social", text: "ETH fees normalize again", x: "4%", y: "112%", dx: "36vw", dy: "-42vh", rotate: "-10deg" },
  { type: "report", text: "13F sector memo · semis", x: "72%", y: "112%", dx: "-25vw", dy: "-43vh", rotate: "8deg" },
  { type: "ticker", text: "BTC · risk asset core", x: "-20%", y: "68%", dx: "48vw", dy: "-14vh", rotate: "15deg" },
  { type: "social", text: "Cloudflare usage thread", x: "108%", y: "72%", dx: "-48vw", dy: "-15vh", rotate: "-13deg" },
  { type: "report", text: "Macro letter: duration risk", x: "28%", y: "-16%", dx: "14vw", dy: "39vh", rotate: "-6deg" },
  { type: "ticker", text: "AAPL services margin", x: "56%", y: "-18%", dx: "-6vw", dy: "41vh", rotate: "12deg" },
  { type: "social", text: "MSTR premium widening", x: "-17%", y: "52%", dx: "42vw", dy: "-2vh", rotate: "-8deg" },
  { type: "report", text: "Digital assets allocation note", x: "112%", y: "55%", dx: "-47vw", dy: "-4vh", rotate: "10deg" },
  { type: "ticker", text: "SMH · watch concentration", x: "22%", y: "116%", dx: "18vw", dy: "-45vh", rotate: "6deg" },
  { type: "social", text: "META ad load recovery", x: "94%", y: "106%", dx: "-35vw", dy: "-38vh", rotate: "-7deg" },
  { type: "report", text: "Personal note: hedge sizing", x: "-12%", y: "22%", dx: "34vw", dy: "18vh", rotate: "11deg" },
  { type: "ticker", text: "ETH · ecosystem watch", x: "112%", y: "28%", dx: "-39vw", dy: "15vh", rotate: "-15deg" }
];

const landingIntroMicroSignals = [
  "AMD", "BTC", "ETH", "NVDA", "TSLA", "AAPL", "META", "SMH",
  "AI capex", "ETF flow", "margin risk", "13F update", "macro note", "fund letter", "KOL thread", "earnings call",
  "rate path", "chain fees", "semis", "cloud spend", "hedge sizing", "position note", "source link", "watchlist",
  "MSTR", "GOOGL", "MSFT", "NET", "risk asset", "cash flow", "revision", "volume spike",
  "PMI", "CPI", "duration", "liquidity", "supply chain", "guidance", "valuation", "drawdown",
  "sector memo", "personal note", "forum post", "filing", "Q3 letter", "sell-side", "on-chain", "factor tilt",
  "sentiment", "support", "resistance", "rotation", "quality", "growth", "beta", "exposure",
  "upgrade", "downgrade", "buyback", "revenue mix", "gross margin", "position size", "conviction", "portfolio"
];

const landingIntroThreads = ["AMD", "BTC", "ETH", "AI Infra"];

function LandingIntro({ onSkip }: { onSkip: () => void }) {
  return (
    <section className="landing-intro" aria-label="信息流整理动画">
      <div className="landing-intro-noise" aria-hidden="true" />
      <div className="landing-intro-lanes" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, index) => (
          <span key={index} style={{ "--lane-index": index } as CSSProperties} />
        ))}
      </div>
      <div className="landing-intro-micro" aria-hidden="true">
        {landingIntroMicroSignals.map((signal, index) => {
          const x = ((index * 17) % 116) - 8;
          const y = ((index * 29) % 112) - 6;
          return (
            <span
              className="intro-micro"
              key={`${signal}-${index}`}
              style={{
                "--micro-delay": `${index * 18}ms`,
                "--micro-x": `${x}%`,
                "--micro-y": `${y}%`,
                "--micro-dx": `${50 - x}vw`,
                "--micro-dy": `${48 - y}vh`
              } as CSSProperties}
            >
              {signal}
            </span>
          );
        })}
      </div>
      <div className="landing-intro-fragments" aria-hidden="true">
        {landingIntroFragments.map((fragment, index) => (
          <span
            className={`intro-fragment ${fragment.type}`}
            key={`${fragment.type}-${fragment.text}`}
            style={{
              "--intro-delay": `${index * 48}ms`,
              "--intro-x": fragment.x,
              "--intro-y": fragment.y,
              "--intro-dx": fragment.dx,
              "--intro-dy": fragment.dy,
              "--intro-rotate": fragment.rotate
            } as CSSProperties}
          >
            {fragment.text}
          </span>
        ))}
      </div>
      <div className="landing-intro-core" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="landing-intro-copy">
        <span>Portfolio intelligence</span>
        <strong>
          <span>市场信息</span>
          <span>整理成判断</span>
        </strong>
      </div>
      <div className="landing-intro-threads" aria-hidden="true">
        {landingIntroThreads.map((thread, index) => (
          <b key={thread} style={{ "--thread-delay": `${3450 + index * 110}ms` } as CSSProperties}>
            {thread}
          </b>
        ))}
      </div>
      <button className="landing-intro-skip" onClick={onSkip} type="button">跳过</button>
    </section>
  );
}

function LandingMarketBackdrop() {
  const groups = [
    { className: "market-group group-a", bars: [22, 34, 18, 46, 30, 54, 26, 38] },
    { className: "market-group group-b", bars: [18, 28, 44, 24, 36, 50, 32, 42] },
    { className: "market-group group-c", bars: [36, 20, 48, 32, 58, 40, 28, 46] },
    { className: "market-group group-d", bars: [20, 42, 30, 52, 24, 36, 56, 34] },
    { className: "market-group group-e", bars: [30, 48, 26, 40, 58, 34, 44, 24] }
  ];

  return (
    <div className="landing-market-backdrop" aria-hidden="true">
      {groups.map((group) => (
        <svg className={group.className} key={group.className} viewBox="0 0 220 120">
          <polyline points="10,82 38,74 66,88 94,56 122,64 150,34 178,50 206,28" />
          {group.bars.map((height, index) => {
            const x = 18 + index * 26;
            const mid = 82 - height * 0.45 + (index % 2 === 0 ? 5 : -5);
            const bodyHeight = Math.max(12, height * 0.48);
            const wickHeight = height + 18;
            return (
              <g className={index % 3 === 1 ? "gold" : undefined} key={`${group.className}-${index}`}>
                <line x1={x} x2={x} y1={mid - wickHeight / 2} y2={mid + wickHeight / 2} />
                <rect height={bodyHeight} rx="2" width="8" x={x - 4} y={mid - bodyHeight / 2} />
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}

const landingPreviewSignals = [
  {
    ticker: "AMD",
    company: "Advanced Micro Devices",
    percent: "34%",
    action: "加仓",
    source: "13F sector memo",
    evidence: "6 条资料",
    summary: "半导体资料多次指向同一条主线。",
    color: "#c8d4df"
  },
  {
    ticker: "BTC",
    company: "Bitcoin",
    percent: "28%",
    action: "持有",
    source: "KOL macro thread",
    evidence: "5 条资料",
    summary: "宏观帖子反复把 BTC 放在风险资产核心。",
    color: "#8fc6d8"
  },
  {
    ticker: "ETH",
    company: "Ethereum",
    percent: "18%",
    action: "持有",
    source: "personal note",
    evidence: "3 条资料",
    summary: "链上费用和生态变化进入继续观察。",
    color: "#d8b76d"
  }
];

const landingCaseInputs = [
  {
    source: "基金信",
    title: "Q3 Semiconductor Letter",
    ticker: "AMD",
    tone: "偏多",
    time: "09:12",
    summary: "AI 服务器需求上修，等待估值回落后加仓。"
  },
  {
    source: "帖子",
    title: "BTC ETF flow thread",
    ticker: "BTC",
    tone: "持有",
    time: "10:34",
    summary: "资金流入恢复，仍作为风险资产核心观察。"
  },
  {
    source: "笔记",
    title: "ETH ecosystem watch",
    ticker: "ETH",
    tone: "观察",
    time: "13:20",
    summary: "费用下降后生态活跃度改善，但仓位暂不加。"
  },
  {
    source: "公告",
    title: "Data center capex update",
    ticker: "AMD",
    tone: "偏多",
    time: "15:48",
    summary: "云厂商资本开支继续指向 AI Infra。"
  }
];

const landingCaseTickers = [
  {
    ticker: "AMD",
    name: "Advanced Micro Devices",
    count: 6,
    stance: "偏多",
    action: "观察加仓",
    sourceMix: "基金信 / 公告 / 笔记",
    change: "AI Infra 资料连续两次提到 AMD，关注度上升。",
    nextQuestion: "为什么 AMD 最近被反复提到？",
    width: "88%"
  },
  {
    ticker: "BTC",
    name: "Bitcoin",
    count: 5,
    stance: "持有",
    action: "继续观察",
    sourceMix: "帖子 / 宏观笔记",
    change: "ETF flow 与风险偏好修复同时出现。",
    nextQuestion: "BTC 的持有依据有哪些？",
    width: "72%"
  },
  {
    ticker: "ETH",
    name: "Ethereum",
    count: 3,
    stance: "观察",
    action: "暂不动作",
    sourceMix: "个人笔记 / 链上观察",
    change: "生态活跃度改善，但资料强度低于 AMD/BTC。",
    nextQuestion: "ETH 还缺哪些确认信号？",
    width: "46%"
  }
];

function LandingCaseDashboard() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeTicker = landingCaseTickers[activeIndex];

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % landingCaseTickers.length);
    }, 2600);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="landing-case-section" id="landing-example" aria-label="Demo 投研工作台快照">
      <div className="landing-case-copy">
        <span>Demo workspace</span>
        <h2>示例资料整理后，会看到什么。</h2>
        <p>标的、观点、来源和变化会被放到同一张工作台里。</p>
      </div>
      <div className="landing-case-dashboard">
        <div className="landing-case-top">
          <span>Research snapshot</span>
          <strong>18 条资料 · 3 条标的主线 · 4 类来源</strong>
        </div>
        <div className="landing-case-grid">
          <section className="landing-case-pane source-feed">
            <div className="landing-case-pane-header">
              <span>资料输入流</span>
              <strong>自动整理</strong>
            </div>
            <div className="landing-case-source-list">
              {landingCaseInputs.map((item, index) => (
                <article
                  className={item.ticker === activeTicker.ticker ? "active" : undefined}
                  key={`${item.source}-${item.title}`}
                  style={{ "--case-row-delay": `${index * 90}ms` } as CSSProperties}
                >
                  <div>
                    <span>{item.source}</span>
                    <strong>{item.title}</strong>
                  </div>
                  <em>{item.time}</em>
                  <b>{item.ticker}</b>
                  <p>{item.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-case-pane ticker-lines">
            <div className="landing-case-pane-header">
              <span>标的主线</span>
              <strong>按资料强度</strong>
            </div>
            <div className="landing-case-ticker-table">
              <div className="landing-case-table-head" aria-hidden="true">
                <span>Ticker</span>
                <span>观点</span>
                <span>动作</span>
                <span>资料</span>
              </div>
              {landingCaseTickers.map((item, index) => (
                <button
                  className={index === activeIndex ? "active" : undefined}
                  key={item.ticker}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                >
                  <span>
                    <strong>{item.ticker}</strong>
                    <em>{item.name}</em>
                  </span>
                  <b>{item.stance}</b>
                  <i>{item.action}</i>
                  <small>{item.count} 条</small>
                  <mark style={{ "--case-bar-width": item.width } as CSSProperties} />
                </button>
              ))}
            </div>
            <div className="landing-case-mini-viz" aria-hidden="true">
              <span style={{ "--viz-width": "74%" } as CSSProperties}>基金信</span>
              <span style={{ "--viz-width": "58%" } as CSSProperties}>帖子</span>
              <span style={{ "--viz-width": "42%" } as CSSProperties}>笔记</span>
            </div>
          </section>

          <aside className="landing-case-pane decision-pane" key={activeTicker.ticker}>
            <div className="landing-case-pane-header">
              <span>持仓参考</span>
              <strong>{activeTicker.ticker}</strong>
            </div>
            <div className="landing-case-decision">
              <span>重点变化</span>
              <strong>{activeTicker.change}</strong>
              <p>来源：{activeTicker.sourceMix}</p>
            </div>
            <div className="landing-case-kpis">
              <div>
                <span>资料数</span>
                <strong>{activeTicker.count}</strong>
              </div>
              <div>
                <span>观点</span>
                <strong>{activeTicker.stance}</strong>
              </div>
              <div>
                <span>动作</span>
                <strong>{activeTicker.action}</strong>
              </div>
            </div>
            <div className="landing-case-question">
              <span>下一步可问</span>
              <strong>{activeTicker.nextQuestion}</strong>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function LandingProductPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSignal = landingPreviewSignals[activeIndex];

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % landingPreviewSignals.length);
    }, 2400);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="landing-product-preview" aria-label="产品示例预览">
      <div className="landing-preview-top">
        <span>Product preview</span>
        <strong>18 条资料已整理</strong>
      </div>
      <div className="landing-preview-body">
        <div className="landing-map-stage">
          <div className="landing-preview-donut">
            <svg viewBox="0 0 180 180" role="img">
              <title>示例标的注意力分布</title>
              <circle cx="90" cy="90" r="58" />
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const startAngle = [0, 122, 223, 288, 322, 342][index];
                const endAngle = [122, 223, 288, 322, 342, 360][index];
                return (
                  <path
                    className={index === activeIndex ? "active" : undefined}
                    d={describeArc(90, 90, 58, startAngle, endAngle)}
                    key={index}
                  />
                );
              })}
            </svg>
            <div key={activeSignal.ticker}>
              <strong>{activeSignal.percent}</strong>
              <span>{activeSignal.ticker}</span>
            </div>
          </div>
          <div className="landing-map-lines" aria-hidden="true">
            {["研报", "帖子", "笔记", "公告", "基金信"].map((label, index) => (
              <span key={label} style={{ "--flow-index": index } as CSSProperties}>{label}</span>
            ))}
          </div>
        </div>
        <div className="landing-preview-rail">
          <div className="landing-active-brief" key={activeSignal.ticker}>
            <span>{activeSignal.company}</span>
            <strong>{activeSignal.ticker} · {activeSignal.action}</strong>
            <p>{activeSignal.summary}</p>
          </div>
          <div className="landing-preview-list">
            {landingPreviewSignals.map((signal, index) => {
              return (
                <button
                  className={index === activeIndex ? "active" : undefined}
                  key={signal.ticker}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                >
                  <i style={{ background: signal.color }} />
                  <span>{signal.ticker}</span>
                  <strong>{signal.evidence}</strong>
                </button>
              );
            })}
          </div>
          <div className="landing-source-card">
            <span>当前依据</span>
            <strong>{activeSignal.source}</strong>
            <em>source linked · 可回溯</em>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceApp({ accountLabel, onSignOut }: { accountLabel: string; onSignOut?: () => Promise<void> }) {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [sourceItems, setSourceItems] = useState<SourceItem[]>(fallbackSources);
  const [selectedSource, setSelectedSource] = useState<SourceItem>(fallbackSources[0]);
  const [sourcesStatus, setSourcesStatus] = useState<"api" | "fallback" | "loading">("loading");
  const [dashboardPayload, setDashboardPayload] = useState<DashboardPayload>(emptyAnalysisDashboardPayload);
  const [dataStatus, setDataStatus] = useState<"api" | "error" | "loading">("loading");
  const [holdings, setHoldings] = useState<HoldingRecord[]>([]);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);
  const [recentEvents, setRecentEvents] = useState<HoldingEvent[]>([]);
  const [pendingIngestItems, setPendingIngestItems] = useState<IngestItem[]>([]);
  const [focusedIngestId, setFocusedIngestId] = useState<string | null>(null);
  const [libraryFocusTicker, setLibraryFocusTicker] = useState<string | null>(null);
  const [ragInitialQuery, setRagInitialQuery] = useState("当前有哪些持仓？");
  const [ragInitialQueryRevision, setRagInitialQueryRevision] = useState(0);
  const [evidenceIngestId, setEvidenceIngestId] = useState<string | null>(null);
  const [portfolioReloadKey, setPortfolioReloadKey] = useState(0);

  function openRagWithQuery(query: string) {
    setRagInitialQuery(query);
    setRagInitialQueryRevision((currentRevision) => currentRevision + 1);
    setView("rag");
  }

  function replaceSource(nextSource: SourceItem) {
    setSourceItems((currentSources) => currentSources.map((source) => (
      source.name === nextSource.name ? nextSource : source
    )));
    setSelectedSource(nextSource);
  }

  useEffect(() => {
    if (view !== "dashboard" && view !== "distribution" && view !== "library") return;

    const controller = new AbortController();

    Promise.all([
      fetchDashboardPayload(controller.signal),
      fetchHoldings(controller.signal),
      fetchPortfolioPositions(controller.signal),
      fetchHoldingEvents(controller.signal),
      fetchIngestItems(controller.signal)
    ])
      .then(([payload, nextHoldings, positions, events, ingestItems]) => {
        setDashboardPayload(payload);
        setHoldings(nextHoldings);
        setPortfolioPositions(positions);
        setRecentEvents(events);
        setPendingIngestItems(ingestItems.filter((item) => item.status !== "已接受" && item.status !== "已驳回"));
        setDataStatus("api");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Portfolio data load failed", error);
        setDashboardPayload(emptyAnalysisDashboardPayload);
        setHoldings([]);
        setPortfolioPositions([]);
        setRecentEvents([]);
        setPendingIngestItems([]);
        setDataStatus("error");
      });

    return () => controller.abort();
  }, [view, portfolioReloadKey]);

  useEffect(() => {
    const controller = new AbortController();

    fetchSources(controller.signal)
      .then((payload) => {
        setSourceItems(payload);
        setSelectedSource(payload[0] ?? fallbackSources[0]);
        setSourcesStatus("api");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Source configuration load failed", error);
        setSourceItems(fallbackSources);
        setSelectedSource(fallbackSources[0]);
        setSourcesStatus("fallback");
      });

    return () => controller.abort();
  }, []);

  const title = useMemo(() => {
    if (view === "distribution") return "分布分析 / Ticker Distribution";
    if (view === "ingest") return "录入 / 导入中心";
    if (view === "library") return "标的资料库 / Ticker Library";
    if (view === "rag") return "问投研资料 / Evidence-grounded Answers";
    if (view === "settings") return "账户与数据";
    if (view === "sources") return "来源设置 / KOL 与数据源管理";
    return "持仓图谱 / Portfolio Intelligence";
  }, [view]);

  return (
    <main className="terminal-shell">
      <header className="command-bar">
        <div className="product-mark">持仓图谱</div>
        <div className="account-label" title={accountLabel}>{accountLabel}</div>
      </header>

      <section className="ticker-strip" aria-label="已入库资料 ticker">
        {portfolioPositions.length === 0 ? (
          <div className="ticker-item empty-strip">
            <span>暂无已入库资料形成的标的倾向</span>
          </div>
        ) : portfolioPositions.slice(0, 8).map((position) => (
          <button
            className="ticker-item"
            key={position.ticker}
            onClick={() => {
              setLibraryFocusTicker(position.ticker);
              setView("library");
            }}
            type="button"
          >
            <span>{position.ticker}</span>
            <strong className={toneClass[stanceTone(position.netStance)]}>{position.netStance}</strong>
          </button>
        ))}
      </section>

      <div className="workspace">
        <aside className="side-nav">
          {navItems.map((item) => (
            <button
              className={item.key === view ? "nav-button active" : "nav-button"}
              key={item.key}
              onClick={() => setView(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className="content-area research-stage">
          <h1>{title}</h1>
          {view === "dashboard" && (
            <DashboardView
              dataStatus={dataStatus}
              onOpenIngest={() => {
                setFocusedIngestId(null);
                setView("ingest");
              }}
              onOpenDistribution={() => setView("distribution")}
              pendingIngestItems={pendingIngestItems}
              portfolioPositions={portfolioPositions}
              recentEvents={recentEvents}
              onOpenTicker={(ticker) => {
                setLibraryFocusTicker(ticker);
                setView("library");
              }}
            />
          )}
          {view === "distribution" && (
            <TickerDistributionView
              dataStatus={dataStatus}
              onOpenIngest={() => {
                setFocusedIngestId(null);
                setView("ingest");
              }}
              onOpenLibrary={() => setView("library")}
              onOpenRag={openRagWithQuery}
              onOpenTicker={(ticker) => {
                setLibraryFocusTicker(ticker);
                setView("library");
              }}
              positions={portfolioPositions}
            />
          )}
          {view === "ingest" && (
            <IngestView
              focusedIngestId={focusedIngestId}
              onAccepted={(ticker) => {
                setLibraryFocusTicker(ticker);
                setPortfolioReloadKey((current) => current + 1);
              }}
            />
          )}
          {view === "library" && (
            <TickerLibraryView
              dataStatus={dataStatus}
              focusedTicker={libraryFocusTicker}
              holdings={holdings}
              onAsk={openRagWithQuery}
              onOpenIngest={() => {
                setFocusedIngestId(null);
                setView("ingest");
              }}
              onOpenEvidence={setEvidenceIngestId}
              onLibraryChanged={() => setPortfolioReloadKey((current) => current + 1)}
              positions={portfolioPositions}
              recentEvents={recentEvents}
            />
          )}
          {view === "rag" && (
            <RagView
              initialQuery={ragInitialQuery}
              initialQueryRevision={ragInitialQueryRevision}
              onOpenEvidence={setEvidenceIngestId}
            />
          )}
          {view === "settings" && <SettingsView accountLabel={accountLabel} onSignOut={onSignOut} />}
          {view === "sources" && (
            <SourcesView
              onSelectSource={setSelectedSource}
              onSourceSaved={replaceSource}
              selectedSource={selectedSource}
              sourceItems={sourceItems}
              sourcesStatus={sourcesStatus}
            />
          )}
        </section>
      </div>
      {evidenceIngestId && (
        <EvidenceDetailDrawer
          ingestItemId={evidenceIngestId}
          onAskTicker={(ticker) => {
            setEvidenceIngestId(null);
            openRagWithQuery(`目前整理的资料怎么看 ${ticker}？`);
          }}
          onClose={() => setEvidenceIngestId(null)}
          onOpenTicker={(ticker) => {
            setEvidenceIngestId(null);
            setLibraryFocusTicker(ticker);
            setView("library");
          }}
        />
      )}
    </main>
  );
}

function AuthLoadingView() {
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="product-mark">持仓图谱</div>
        <p>正在验证登录状态...</p>
      </section>
    </main>
  );
}

function LoginView({ onSignedIn }: { onSignedIn: (token: string, email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("使用已授权账户登录");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus("正在验证...");

    try {
      const session = await signIn(email.trim(), password);
      if (!session) throw new Error("No session");
      onSignedIn(session.access_token, session.user.email ?? session.user.id);
    } catch {
      setStatus("登录失败，请检查账号或密码");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="product-mark">持仓图谱</div>
        <h1>账户登录</h1>
        <p>{status}</p>
        <form className="auth-form" onSubmit={handleLogin}>
          <label>
            <span>邮箱</span>
            <input autoComplete="email" className="terminal-input" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>密码</span>
            <input autoComplete="current-password" className="terminal-input" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <button className="save-button" disabled={isLoading} type="submit">{isLoading ? "验证中" : "登录"}</button>
        </form>
      </section>
    </main>
  );
}

function RagView({
  initialQuery,
  initialQueryRevision,
  onOpenEvidence
}: {
  initialQuery: string;
  initialQueryRevision: number;
  onOpenEvidence: (id: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [messages, setMessages] = useState<RagChatMessage[]>([]);
  const [status, setStatus] = useState("等待查询");
  const [isLoading, setIsLoading] = useState(false);
  const suggestedQueries = ["我整理过哪些标的？", "最近有什么新变化？", "有什么需要留意的风险？", "为什么会关注 NVDA？"];

  useEffect(() => {
    setQuery(initialQuery);
    setStatus("等待查询");
  }, [initialQuery, initialQueryRevision]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setStatus("请输入问题");
      return;
    }

    setIsLoading(true);
    setStatus("正在检索已整理资料...");
    const userMessage: RagChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedQuery
    };
    const history = messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content
    }));

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setQuery("");

    try {
      const nextResponse = await queryRag(trimmedQuery, history);
      const assistantMessage: RagChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: nextResponse.answer,
        citations: nextResponse.citations,
        generatedAt: nextResponse.generatedAt,
        answerMode: nextResponse.answerMode
      };

      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      setStatus(`已生成 · ${nextResponse.citations.length} 条证据`);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: "结论：\n这次没有完成查询。\n\n需要复核：\n查询服务或网络可能暂时不可用，这不代表你整理的资料里没有相关记录。\n\n可继续追问：\n稍后重试，或先切换到标的资料库查看已入库记录。"
        }
      ]);
      setStatus("查询失败，可稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.citations);
  const followUpSuggestions = getFollowUpSuggestions(latestAssistant);

  return (
    <div className="workspace-split rag-grid">
      <section className="workspace-section panel rag-query-panel">
        <div className="panel-header">
          <span>问投研资料</span>
          <strong>{status}</strong>
        </div>
        <p className="rag-boundary">回答只使用已入库的投研资料；没有依据时会直接说明资料不足，不补外部行情或投资建议。</p>
        <div className="rag-suggestion-list" aria-label="常用问题">
          {suggestedQueries.map((suggestion) => (
            <button key={suggestion} onClick={() => setQuery(suggestion)} type="button">
              {suggestion}
            </button>
          ))}
        </div>
        <div className="rag-followup-list" aria-label="继续追问">
          <span>继续追问</span>
          {followUpSuggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => setQuery(suggestion)} type="button">
              {suggestion}
            </button>
          ))}
        </div>
        <form className="rag-form" onSubmit={handleSubmit}>
          <textarea
            className="terminal-textarea"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="围绕已入库资料连续追问，例如：为什么会关注 SMH？"
            value={query}
          />
          <button className="save-button" disabled={isLoading} type="submit">
            {isLoading ? "思考中" : "发送"}
          </button>
        </form>
      </section>

      <section className="workspace-section panel rag-chat-panel">
        <div className="panel-header">
          <span>对话</span>
          <strong>
            {messages.length ? `${messages.length} 条消息` : "未开始"}
          </strong>
        </div>
        {messages.length ? (
          <div className="chat-thread">
            {messages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                <div className="chat-message-meta">
                  <span>{message.role === "user" ? "你" : "投研资料助手"}</span>
                  {message.generatedAt && (
                    <strong>{message.answerMode === "llm" ? "LLM+资料库" : "规则模板"} · {formatShortDate(message.generatedAt)}</strong>
                  )}
                </div>
                <div className="chat-message-body">
                  {renderChatContent(message)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rag-empty-state">
            <strong>还没有开始查询</strong>
            <p>可以连续追问当前持仓、某个标的的依据、最近变化或风险线索。后续问题会带上最近对话上下文。</p>
          </div>
        )}
      </section>

      <section className="rail-list panel rag-citations-panel">
        <div className="panel-header">
          <span>本轮证据</span>
          <strong>{latestAssistant?.citations?.length ?? 0}</strong>
        </div>
        {!latestAssistant?.citations || latestAssistant.citations.length === 0 ? (
          <div className="rag-empty-state">
            <strong>暂无命中证据</strong>
            <p>可以先导入相关资料，或把问题问得更具体。系统不会用你已整理资料以外的信息补答案。</p>
          </div>
        ) : (
          <div className="citation-list">
            {latestAssistant.citations.map((citation) => (
              <button
                className="data-row citation-card"
                disabled={!citation.sourceIngestItemId}
                key={citation.id}
                onClick={() => citation.sourceIngestItemId && onOpenEvidence(citation.sourceIngestItemId)}
                type="button"
              >
                <div className="citation-card-top">
                  <span>{getCitationPrimaryTicker(citation)}</span>
                  <b>{formatCitationEntityType(citation.entityType)}</b>
                </div>
                <strong>{getCitationDisplayTitle(citation)}</strong>
                <span>{getCitationEvidenceMeta(citation)}</span>
                <em>{getUserFacingCitationSnippet(citation)}</em>
                <div className="citation-card-footer">
                  <span>{citation.sourceIngestItemId ? "原始资料可打开" : "聚合记录"}</span>
                  {citation.sourceIngestItemId ? <b>查看原始资料</b> : <b>仅聚合记录</b>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardView({
  dataStatus,
  onOpenIngest,
  onOpenDistribution,
  onOpenTicker,
  pendingIngestItems,
  portfolioPositions,
  recentEvents
}: {
  dataStatus: "api" | "error" | "loading";
  onOpenIngest: () => void;
  onOpenDistribution: () => void;
  onOpenTicker: (ticker: string) => void;
  pendingIngestItems: IngestItem[];
  portfolioPositions: PortfolioPosition[];
  recentEvents: HoldingEvent[];
}) {
  const frequency = buildTickerFrequencyModel(portfolioPositions);
  const activePositions = portfolioPositions.filter((position) => position.status === "活跃");
  const topPosition = activePositions[0];
  const sourceRows = recentEvents.slice(0, 4);
  const pendingRows = pendingIngestItems.slice(0, Math.max(0, 4 - sourceRows.length));
  const statusLabel = dataStatus === "api" ? `${frequency.totalHoldings} 条资料 · ${activePositions.length} 条标的主线` : dataStatus === "loading" ? "正在读取资料库" : "资料库连接失败";

  return (
    <div className="home-page research-home">
      <section className="research-home-copy">
        <span>{publicDemoMode ? "Demo Workspace" : "Research Workspace"}</span>
        <h2>示例资料整理后，会看到什么。</h2>
        <p>标的、观点、来源和变化会被放到同一张工作台里。</p>
        <div className="home-hero-actions">
          <button className="primary-action" onClick={onOpenIngest} type="button">导入资料</button>
          <button className="secondary-action" onClick={onOpenDistribution} type="button">查看分布</button>
        </div>
      </section>

      <section className="research-dashboard" aria-label="投研工作台快照">
        <div className="research-dashboard-top">
          <span>RESEARCH SNAPSHOT</span>
          <strong>{statusLabel}</strong>
        </div>
        <div className="research-dashboard-grid">
          <section className="research-pane source-feed">
            <div className="panel-header">
              <span>资料输入流</span>
              <strong>最近变化</strong>
            </div>
            <div className="research-list">
              {sourceRows.length || pendingRows.length ? (
                <>
                  {sourceRows.map((event) => (
                    <article className="research-row active" key={event.id}>
                      <div>
                        <span>{event.ticker}</span>
                        <em>{formatShortDate(event.createdAt)}</em>
                      </div>
                      <strong>{event.action}</strong>
                      <p>{event.summary}</p>
                    </article>
                  ))}
                  {pendingRows.map((item) => (
                    <article className="research-row" key={item.id}>
                      <div>
                        <span>{formatSourceType(item.sourceType)}</span>
                        <em>{item.status}</em>
                      </div>
                      <strong>{item.extractedTicker ?? item.ticker}</strong>
                      <p>{item.extractionSummary ?? getUserFacingSourceSummary(item)}</p>
                    </article>
                  ))}
                </>
              ) : (
                <p className="empty-state">暂无资料。导入一段研报、帖子或笔记后，这里会显示整理结果。</p>
              )}
            </div>
          </section>

          <section className="research-pane ticker-lines">
            <div className="panel-header">
              <span>标的主线</span>
              <strong>按资料强度</strong>
            </div>
            <div className="research-table-head" aria-hidden="true">
              <span>Ticker</span>
              <span>观点</span>
              <span>动作</span>
              <span>资料</span>
            </div>
            <div className="research-ticker-table">
              {activePositions.length ? activePositions.slice(0, 5).map((position) => (
                <button key={position.ticker} onClick={() => onOpenTicker(position.ticker)} type="button">
                  <span>
                    <strong>{position.ticker}</strong>
                    <em>{position.sources[0] ?? "source linked"}</em>
                  </span>
                  <b className={toneClass[stanceTone(position.netStance)]}>{position.netStance}</b>
                  <i>{position.latestAction}</i>
                  <small>{position.holdingsCount} 条</small>
                  <mark style={{ width: `${Math.max(18, Math.min(100, position.holdingsCount * 12))}%` }} />
                </button>
              )) : (
                <p className="empty-state">等待已入库 ticker。系统会按资料出现频次生成主线。</p>
              )}
            </div>
          </section>

          <aside className="research-pane research-detail-pane">
            <div className="panel-header">
              <span>持仓参考</span>
              <strong>{topPosition?.ticker ?? "等待资料"}</strong>
            </div>
            <div className="research-decision">
              <span>重点变化</span>
              <strong>{topPosition ? `${topPosition.ticker} 被 ${topPosition.holdingsCount} 条资料提到。` : "先导入资料，再形成判断。"}</strong>
              <p>{topPosition ? `当前聚合方向为 ${topPosition.netStance}，最近动作是 ${topPosition.latestAction}。` : "系统会把资料整理为标的、观点、来源和变化。"} </p>
            </div>
            <div className="research-kpis">
              <div><span>资料数</span><strong>{frequency.totalHoldings}</strong></div>
              <div><span>标的</span><strong>{activePositions.length}</strong></div>
              <div><span>最高频</span><strong>{topPosition?.ticker ?? "暂无"}</strong></div>
            </div>
            <button className="research-question" onClick={topPosition ? () => onOpenTicker(topPosition.ticker) : onOpenIngest} type="button">
              <span>下一步</span>
              <strong>{topPosition ? `打开 ${topPosition.ticker} 资料库` : "导入第一组资料"}</strong>
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

interface TickerFrequencySlice {
  ticker: string;
  label: string;
  value: number;
  percent: number;
  color: string;
  position?: PortfolioPosition;
  isOther: boolean;
}

interface TickerFrequencyModel {
  activePositions: PortfolioPosition[];
  otherPositions: PortfolioPosition[];
  slices: TickerFrequencySlice[];
  totalHoldings: number;
}

function buildTickerFrequencyModel(positions: PortfolioPosition[], maxSlices = 10): TickerFrequencyModel {
  const activePositions = positions
    .filter((position) => position.status === "活跃" && position.holdingsCount > 0)
    .sort((a, b) => b.holdingsCount - a.holdingsCount || a.ticker.localeCompare(b.ticker));
  const totalHoldings = activePositions.reduce((sum, position) => sum + position.holdingsCount, 0);
  const visiblePositions = activePositions.slice(0, maxSlices);
  const otherPositions = activePositions.slice(maxSlices);
  const otherValue = otherPositions.reduce((sum, position) => sum + position.holdingsCount, 0);
  const slices: TickerFrequencySlice[] = totalHoldings === 0 ? [] : [
    ...visiblePositions.map((position, index) => ({
      ticker: position.ticker,
      label: position.ticker,
      value: position.holdingsCount,
      percent: position.holdingsCount / totalHoldings,
      color: tickerPalette[index % tickerPalette.length],
      position,
      isOther: false
    })),
    ...(otherPositions.length ? [{
      ticker: "OTHER",
      label: "其他",
      value: otherValue,
      percent: otherValue / totalHoldings,
      color: "#77817f",
      isOther: true
    }] : [])
  ];

  return { activePositions, otherPositions, slices, totalHoldings };
}

function TickerDistributionPreviewCard({
  dataStatus,
  frequency,
  onOpenDistribution,
  onOpenIngest
}: {
  dataStatus: "api" | "error" | "loading";
  frequency: TickerFrequencyModel;
  onOpenDistribution: () => void;
  onOpenIngest: () => void;
}) {
  const topSlice = frequency.slices[0];
  let cursorAngle = 0;

  return (
    <div className="workspace-preview-strip home-preview-card">
      <div className="home-preview-header">
        <span>Distribution Preview</span>
        <strong>{topSlice ? `${frequency.activePositions.length} 个标的` : "等待资料"}</strong>
      </div>
      <div className="home-preview-body">
        <div className={topSlice ? "home-mini-donut" : "home-mini-donut empty"} aria-label="Ticker 分布预览">
          {topSlice ? (
            <svg viewBox="0 0 180 180" role="img">
              <title>已入库资料的 ticker 分布预览</title>
              <circle className="home-mini-donut-track" cx="90" cy="90" r="62" />
              {frequency.slices.slice(0, 6).map((slice) => {
                const startAngle = cursorAngle;
                const endAngle = cursorAngle + slice.percent * 360;
                cursorAngle = endAngle;
                if (slice.percent >= 0.999) {
                  return <circle className="home-mini-slice" cx="90" cy="90" key={slice.ticker} r="62" stroke={slice.color} />;
                }

                return (
                  <path
                    className="home-mini-slice"
                    d={describeArc(90, 90, 62, startAngle, endAngle)}
                    key={slice.ticker}
                    stroke={slice.color}
                  />
                );
              })}
            </svg>
          ) : (
            <div className="home-mini-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          <div>
            <strong>{topSlice ? `${(topSlice.percent * 100).toFixed(1)}%` : "0%"}</strong>
            <span>{topSlice?.label ?? "待生成"}</span>
          </div>
        </div>
        <div className="home-preview-copy">
          <strong>{topSlice ? `${topSlice.label} 是当前最高频标的` : "导入资料后自动生成分布"}</strong>
          <p>
            {topSlice
              ? `${frequency.totalHoldings} 条已入库资料会汇总为 ticker 占比，并能继续打开证据链。`
              : dataStatus === "error"
                ? "当前无法读取资料库。恢复连接后，已入库资料会自动生成分布。"
                : "先粘贴文本或链接，系统整理完成后，这里会出现真实 ticker 分布。"}
          </p>
        </div>
      </div>
      {topSlice ? (
        <div className="home-preview-rank">
          {frequency.slices.slice(0, 3).map((slice) => (
            <span key={slice.ticker}>
              <i style={{ background: slice.color }} />
              <b>{slice.label}</b>
              <em>{(slice.percent * 100).toFixed(1)}%</em>
            </span>
          ))}
        </div>
      ) : (
        <div className="home-preview-steps">
          <span>1. 粘贴文本/链接</span>
          <span>2. AI 整理 ticker 与动作</span>
          <span>3. 生成占比图</span>
        </div>
      )}
      <button className="panel-link-button" onClick={topSlice ? onOpenDistribution : onOpenIngest} type="button">
        {topSlice ? "查看完整分布" : "去录入资料"}
      </button>
    </div>
  );
}

function TickerDistributionView({
  dataStatus,
  onOpenIngest,
  onOpenLibrary,
  onOpenRag,
  onOpenTicker,
  positions
}: {
  dataStatus: "api" | "error" | "loading";
  onOpenIngest: () => void;
  onOpenLibrary: () => void;
  onOpenRag: (query: string) => void;
  onOpenTicker: (ticker: string) => void;
  positions: PortfolioPosition[];
}) {
  const frequency = buildTickerFrequencyModel(positions);
  const { activePositions, otherPositions, slices, totalHoldings } = frequency;
  const [selectedTicker, setSelectedTicker] = useState<string | null>(slices[0]?.ticker ?? null);
  const selectedSlice = slices.find((slice) => slice.ticker === selectedTicker) ?? slices[0];
  const selectedBrand = selectedSlice && !selectedSlice.isOther ? tickerBrand(selectedSlice.ticker) : undefined;
  let cursorAngle = 0;

  useEffect(() => {
    if (slices.length === 0) {
      setSelectedTicker(null);
      return;
    }

    if (!selectedTicker || !slices.some((slice) => slice.ticker === selectedTicker)) {
      setSelectedTicker(slices[0].ticker);
    }
  }, [selectedTicker, slices]);

  return (
    <div className="distribution-page">
      <section className="distribution-intro">
        <div>
          <span>{publicDemoMode ? "Demo Distribution" : "Portfolio Distribution"}</span>
          <h2>看清资料集中在哪些标的。</h2>
          <p>按已入库资料出现频次计算占比，帮助判断研究注意力是否过度集中、哪些 ticker 值得继续追踪。</p>
        </div>
        <div className="distribution-summary">
          <MetricCard label="标的数量" value={`${activePositions.length}`} detail={dataStatus === "api" ? "已入库资料" : dataStatus === "loading" ? "加载中" : "连接失败"} tone={activePositions.length ? "positive" : "neutral"} />
          <MetricCard label="资料总数" value={`${totalHoldings}`} detail="用于占比计算" tone="neutral" />
          <MetricCard label="最高频" value={slices[0]?.label ?? "暂无"} detail={slices[0] ? `${slices[0].value} 条资料` : "等待入库"} tone={slices[0] ? "positive" : "neutral"} />
        </div>
      </section>

      {slices.length === 0 || !selectedSlice ? (
        <section className="workspace-section panel distribution-empty-panel">
          <div className="panel-header">
            <span>Ticker 频次分布</span>
            <strong>{dataStatus === "loading" ? "加载中" : "等待资料"}</strong>
          </div>
          <div className="distribution-onboarding">
            <div className="distribution-onboarding-visual" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <h3>先导入资料，再生成分布。</h3>
              <p>{dataStatus === "error" ? "当前无法读取资料库。恢复连接后，已入库资料会在这里生成 ticker 占比。" : "粘贴文本或链接后，系统会自动整理 ticker、动作和来源，并汇总成分布图。"}</p>
              <ol>
                <li>粘贴研报、笔记或链接</li>
                <li>AI 整理 ticker 与动作</li>
                <li>查看占比、排行和证据链</li>
              </ol>
              <button className="panel-link-button" onClick={onOpenIngest} type="button">去录入资料</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="workspace-split distribution-layout">
          <div className="workspace-section panel distribution-chart-panel">
            <div className="panel-header">
              <span>Ticker 频次分布</span>
              <strong>{`${activePositions.length} 个标的 · ${totalHoldings} 条资料`}</strong>
            </div>
            <div className="distribution-chart-body">
              <div className="distribution-donut-stage" aria-label="资料提及占比">
                <svg className="distribution-donut" role="img" viewBox="0 0 360 360">
                  <title>按 ticker 出现频次统计的资料占比</title>
                  <circle className="distribution-donut-track" cx="180" cy="180" r="128" />
                  {slices.map((slice, index) => {
                    const startAngle = cursorAngle;
                    const endAngle = cursorAngle + slice.percent * 360;
                    cursorAngle = endAngle;
                    const isSelected = selectedSlice.ticker === slice.ticker;
                    const midAngle = (startAngle + endAngle) / 2;
                    const offset = isSelected ? 9 : 0;
                    const offsetPoint = polarToCartesian(0, 0, offset, midAngle);
                    const sliceStyle = {
                      "--slice-color": slice.color,
                      "--slice-delay": `${index * 45}ms`
                    } as CSSProperties;

                    if (slice.percent >= 0.999) {
                      return (
                        <circle
                          aria-label={`${slice.label}，${slice.value} 条资料，占比 100%`}
                          className={isSelected ? "distribution-slice selected" : "distribution-slice"}
                          cx={180 + offsetPoint.x}
                          cy={180 + offsetPoint.y}
                          key={slice.ticker}
                          onClick={() => setSelectedTicker(slice.ticker)}
                          onDoubleClick={() => {
                            if (!slice.isOther && slice.position) onOpenTicker(slice.position.ticker);
                          }}
                          pathLength="100"
                          r="128"
                          role="button"
                          stroke={slice.color}
                          style={sliceStyle}
                          tabIndex={0}
                        />
                      );
                    }

                    return (
                      <path
                        aria-label={`${slice.label}，${slice.value} 条资料，占比 ${(slice.percent * 100).toFixed(1)}%`}
                        className={isSelected ? "distribution-slice selected" : "distribution-slice"}
                        d={describeArc(180 + offsetPoint.x, 180 + offsetPoint.y, 128, startAngle, endAngle)}
                        key={slice.ticker}
                        onClick={() => setSelectedTicker(slice.ticker)}
                        onDoubleClick={() => {
                          if (!slice.isOther && slice.position) onOpenTicker(slice.position.ticker);
                        }}
                        pathLength="100"
                        role="button"
                        stroke={slice.color}
                        style={sliceStyle}
                        tabIndex={0}
                      />
                    );
                  })}
                  <circle className="distribution-donut-hole" cx="180" cy="180" r="82" />
                </svg>
                <div className="distribution-donut-center" key={`center-${selectedSlice.ticker}`}>
                  <span>当前占比</span>
                  <strong>{(selectedSlice.percent * 100).toFixed(1)}%</strong>
                  <em>{selectedSlice.label}</em>
                </div>
              </div>

              <div className="detail-pane distribution-selected-card" key={`detail-${selectedSlice.ticker}`} style={{ "--selected-color": selectedSlice.color } as CSSProperties}>
                <TickerBrandBadge slice={selectedSlice} />
                <div className="distribution-selected-copy">
                  <span>{selectedSlice.isOther ? "汇总分组" : selectedBrand?.name}</span>
                  <strong>{selectedSlice.label}</strong>
                  <p>
                    {selectedSlice.value} 条已入库资料，占全部入库资料 {(selectedSlice.percent * 100).toFixed(1)}%。
                    {selectedSlice.isOther ? "该分组只用于汇总小份额标的。" : "可以打开资料库查看对应证据链。"}
                  </p>
                </div>
                <div className="distribution-selected-meta">
                  <span>最新动作 <strong className={selectedSlice.position ? toneClass[actionTone(selectedSlice.position.latestAction)] : "tone-neutral"}>{selectedSlice.position?.latestAction ?? "汇总"}</strong></span>
                  <span>聚合方向 <strong className={selectedSlice.position ? toneClass[stanceTone(selectedSlice.position.netStance)] : "tone-neutral"}>{selectedSlice.position?.netStance ?? "多标的"}</strong></span>
                  <span>来源数量 <strong>{selectedSlice.position ? `${selectedSlice.position.sourceCount} 个` : `${otherPositions.length} 个标的`}</strong></span>
                  <span>最后更新 <strong>{selectedSlice.position?.lastUpdated ? formatShortDate(selectedSlice.position.lastUpdated) : "汇总"}</strong></span>
                </div>
                <div className="distribution-selected-actions">
                  <button disabled={selectedSlice.isOther || !selectedSlice.position} onClick={() => selectedSlice.position && onOpenTicker(selectedSlice.position.ticker)} type="button">打开资料库</button>
                  <button disabled={selectedSlice.isOther || !selectedSlice.position} onClick={() => selectedSlice.position && onOpenRag(`目前整理的资料怎么看 ${selectedSlice.position.ticker}？`)} type="button">问这个标的</button>
                </div>
              </div>
            </div>
          </div>

          <aside className="rail-list panel distribution-rank-panel">
            <div className="panel-header">
              <span>Ticker 排行</span>
              <strong>按资料频次</strong>
            </div>
            <div className="distribution-rank-list">
              {slices.map((slice, index) => (
                <button
                  className={selectedSlice.ticker === slice.ticker ? "active" : undefined}
                  key={slice.ticker}
                  onClick={() => setSelectedTicker(slice.ticker)}
                  style={{ "--rank-color": slice.color } as CSSProperties}
                  type="button"
                >
                  <em>{String(index + 1).padStart(2, "0")}</em>
                  <i style={{ background: slice.color }} />
                  <span>{slice.label}</span>
                  <strong>{slice.value} 条</strong>
                  <b>{(slice.percent * 100).toFixed(1)}%</b>
                </button>
              ))}
            </div>
            <button className="panel-link-button distribution-library-link" onClick={onOpenLibrary} type="button">查看完整资料库</button>
          </aside>
        </section>
      )}
    </div>
  );
}

function TickerBrandBadge({ slice }: { slice: TickerFrequencySlice }) {
  const brand = slice.isOther ? { name: "其他", mark: "•••", accent: slice.color } : tickerBrand(slice.ticker);

  return (
    <div className="ticker-brand-badge" style={{ borderColor: brand.accent, color: brand.accent }}>
      <span>{brand.mark}</span>
    </div>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={toneClass[tone]}>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

function TickerLibraryView({
  dataStatus,
  focusedTicker,
  holdings,
  onAsk,
  onLibraryChanged,
  onOpenIngest,
  onOpenEvidence,
  positions,
  recentEvents
}: {
  dataStatus: "api" | "error" | "loading";
  focusedTicker: string | null;
  holdings: HoldingRecord[];
  onAsk: (query: string) => void;
  onLibraryChanged: () => void;
  onOpenIngest: () => void;
  onOpenEvidence: (id: string) => void;
  positions: PortfolioPosition[];
  recentEvents: HoldingEvent[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | SignalAction>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | ResearchSourceType>("all");
  const [timeWindow, setTimeWindow] = useState<"all" | "7d" | "30d">("all");
  const [selectedTickerForRecords, setSelectedTickerForRecords] = useState<string | null>(null);
  const [selectedRecordLimit, setSelectedRecordLimit] = useState(20);
  const [archivingTicker, setArchivingTicker] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedTicker) return;

    setSearchQuery("");
    setActionFilter("all");
    setSourceTypeFilter("all");
    setTimeWindow("all");
    setSelectedTickerForRecords(focusedTicker);
    setSelectedRecordLimit(20);
  }, [focusedTicker]);

  const activeHoldings = holdings.filter((holding) => holding.status === "已确认");
  const activeTickerSet = new Set(activeHoldings.map((holding) => holding.ticker));
  const holdingsById = new Map(activeHoldings.map((holding) => [holding.id, holding]));
  const normalizedSearch = searchQuery.trim().toUpperCase();
  const cutoff = timeWindow === "all"
    ? null
    : Date.now() - (timeWindow === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;

  function isInsideTimeWindow(value: string) {
    if (!cutoff) return true;
    return new Date(value).getTime() >= cutoff;
  }

  function matchesSearch(value: string | undefined) {
    if (!normalizedSearch) return true;
    return value?.toUpperCase().includes(normalizedSearch) ?? false;
  }

  const filteredHoldings = activeHoldings.filter((holding) => {
    const matchesAction = actionFilter === "all" || holding.lastAction === actionFilter;
    const matchesSourceType = sourceTypeFilter === "all" || holding.sourceType === sourceTypeFilter;
    const matchesTime = isInsideTimeWindow(holding.updatedAt);
    const matchesText = [
      holding.ticker,
      holding.source,
      holding.sourceName,
      holding.reportingPeriod,
      formatSourceType(holding.sourceType)
    ].some(matchesSearch);

    return matchesAction && matchesSourceType && matchesTime && matchesText;
  });

  const filteredEvents = recentEvents.filter((event) => {
    const holding = holdingsById.get(event.holdingId);
    if (!holding) return false;

    const matchesAction = actionFilter === "all" || event.action === actionFilter;
    const matchesSourceType = sourceTypeFilter === "all" || holding.sourceType === sourceTypeFilter;
    const matchesTime = isInsideTimeWindow(event.createdAt);
    const matchesText = [
      event.ticker,
      event.action,
      event.summary,
      holding.source,
      holding.sourceName,
      formatSourceType(holding.sourceType)
    ].some(matchesSearch);

    return matchesAction && matchesSourceType && matchesTime && matchesText;
  });

  const activePositions = positions.filter((position) => activeTickerSet.has(position.ticker));
  const hasAnyTicker = activeHoldings.length > 0;
  const hasActiveFilters = Boolean(normalizedSearch) || actionFilter !== "all" || sourceTypeFilter !== "all" || timeWindow !== "all";
  const visibleTickers = [...new Set([
    ...(hasActiveFilters ? [] : activePositions.map((position) => position.ticker)),
    ...filteredHoldings.map((holding) => holding.ticker),
    ...filteredEvents.map((event) => event.ticker)
  ])].sort();
  const recordsTicker = selectedTickerForRecords && visibleTickers.includes(selectedTickerForRecords)
    ? selectedTickerForRecords
    : null;
  const recordsPosition = recordsTicker ? activePositions.find((item) => item.ticker === recordsTicker) : undefined;
  const recordsHoldings = recordsTicker
    ? filteredHoldings
      .filter((holding) => holding.ticker === recordsTicker)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const recordsEvents = recordsTicker
    ? filteredEvents
      .filter((event) => event.ticker === recordsTicker)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  function resetFilters() {
    setSearchQuery("");
    setActionFilter("all");
    setSourceTypeFilter("all");
    setTimeWindow("all");
    setSelectedTickerForRecords(null);
    setSelectedRecordLimit(20);
  }

  async function handleArchiveTicker(ticker: string, tickerHoldings: HoldingRecord[]) {
    if (tickerHoldings.length === 0 || archivingTicker) return;
    const confirmed = window.confirm(`确认将 ${ticker} 的 ${tickerHoldings.length} 条已入库资料移出资料库吗？原始录入记录会保留，可在账户导出中追溯。`);

    if (!confirmed) return;

    setArchivingTicker(ticker);

    try {
      await Promise.all(tickerHoldings.map((holding) => archiveHolding(holding.id)));
      onLibraryChanged();
      if (selectedTickerForRecords === ticker) setSelectedTickerForRecords(null);
    } catch (error) {
      console.error("Archive holdings failed", error);
      window.alert("移出资料库失败，请检查服务状态后重试。");
    } finally {
      setArchivingTicker(null);
    }
  }

  if (!hasAnyTicker) {
    return (
      <section className="workspace-section panel library-empty-panel">
        <div className="panel-header">
          <span>标的资料库</span>
          <strong>{dataStatus === "api" ? "API 实时" : dataStatus === "loading" ? "加载中" : "连接失败"}</strong>
        </div>
        <p className="empty-state">{dataStatus === "error" ? "无法读取资料库，请检查服务状态后重试。" : "资料库里还没有已入库标的。先导入资料，系统会自动整理并按 ticker 聚合展示。"}</p>
        <button className="panel-link-button" onClick={onOpenIngest} type="button">去录入资料</button>
      </section>
    );
  }

  return (
    <>
      <section className="workspace-section panel library-filter-panel">
        <div className="panel-header">
          <span>筛选资料库</span>
          <strong>{visibleTickers.length} 个标的 · {filteredHoldings.length} 条资料</strong>
        </div>
        <div className="library-filter-bar">
          <label>
            <span>搜索</span>
            <input
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ticker / 来源 / 报告期"
              type="search"
              value={searchQuery}
            />
          </label>
          <label>
            <span>时间</span>
            <select onChange={(event) => setTimeWindow(event.target.value as "all" | "7d" | "30d")} value={timeWindow}>
              <option value="all">全部时间</option>
              <option value="7d">最近 7 天</option>
              <option value="30d">最近 30 天</option>
            </select>
          </label>
          <label>
            <span>动作</span>
            <select onChange={(event) => setActionFilter(event.target.value as "all" | SignalAction)} value={actionFilter}>
              <option value="all">全部动作</option>
              {signalActionOptions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </label>
          <label>
            <span>来源类型</span>
            <select onChange={(event) => setSourceTypeFilter(event.target.value as "all" | ResearchSourceType)} value={sourceTypeFilter}>
              <option value="all">全部来源</option>
              {researchSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button disabled={!hasActiveFilters} onClick={resetFilters} type="button">清除筛选</button>
        </div>
      </section>

      {visibleTickers.length === 0 ? (
        <section className="workspace-section panel library-empty-panel">
          <div className="panel-header">
            <span>没有匹配资料</span>
            <strong>调整筛选</strong>
          </div>
          <p className="empty-state">当前筛选条件下没有匹配的标的资料。可以放宽时间、动作或来源类型。</p>
          <button className="panel-link-button" onClick={resetFilters} type="button">清除筛选</button>
        </section>
      ) : (
        <div className="workspace-split library-browser">
          <div className="rail-list library-grid">
            {visibleTickers.map((ticker) => {
              const position = activePositions.find((item) => item.ticker === ticker);
              const tickerHoldings = filteredHoldings.filter((holding) => holding.ticker === ticker);
              const tickerEvents = filteredEvents
                .filter((event) => event.ticker === ticker)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
              const latestEvent = tickerEvents[0];

              return (
                <TickerSummaryCard
                  isArchiving={archivingTicker === ticker}
                  isSelected={recordsTicker === ticker}
                  key={ticker}
                  latestEvent={latestEvent}
                  onArchive={() => handleArchiveTicker(ticker, tickerHoldings)}
                  onAsk={() => onAsk(`目前整理的资料怎么看 ${ticker}？`)}
                  onShowRecords={() => {
                    setSelectedTickerForRecords(ticker);
                    setSelectedRecordLimit(20);
                  }}
                  position={position}
                  ticker={ticker}
                  tickerHoldings={tickerHoldings}
                />
              );
            })}
          </div>
          {recordsTicker ? (
            <TickerRecordsPanel
              events={recordsEvents}
              holdings={recordsHoldings}
              limit={selectedRecordLimit}
              onAsk={() => onAsk(`目前整理的资料怎么看 ${recordsTicker}？`)}
              onClose={() => setSelectedTickerForRecords(null)}
              onLoadMore={() => setSelectedRecordLimit((currentLimit) => currentLimit + 20)}
              onOpenEvidence={onOpenEvidence}
              position={recordsPosition}
              ticker={recordsTicker}
            />
          ) : (
            <section className="detail-pane panel ticker-records-panel library-records-placeholder">
              <div className="panel-header">
                <span>记录详情</span>
                <strong>选择一个 ticker</strong>
              </div>
              <p className="empty-state">从左侧 ticker index 选择标的，查看已入库资料、最近动作和原始依据。</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function TickerSummaryCard({
  isArchiving,
  isSelected,
  latestEvent,
  onArchive,
  onAsk,
  onShowRecords,
  position,
  ticker,
  tickerHoldings
}: {
  isArchiving: boolean;
  isSelected: boolean;
  latestEvent?: HoldingEvent;
  onArchive: () => void;
  onAsk: () => void;
  onShowRecords: () => void;
  position?: PortfolioPosition;
  ticker: string;
  tickerHoldings: HoldingRecord[];
}) {
  const latestHolding = tickerHoldings[0];
  const latestAction = position?.latestAction ?? latestHolding?.lastAction ?? "暂无";
  const sourceCount = position?.sourceCount ?? new Set(tickerHoldings.map((holding) => sourceDisplayName(holding))).size;
  const lastUpdated = position?.lastUpdated ?? latestHolding?.updatedAt;
  const latestSummary = latestEvent
    ? hideConfidenceText(latestEvent.summary)
    : latestHolding
      ? `${sourceDisplayName(latestHolding)} · ${formatSourceType(latestHolding.sourceType)}`
      : "暂无已入库资料。";

  return (
    <section className={isSelected ? "data-row panel ticker-card selected" : "data-row panel ticker-card"}>
      <div className="panel-header">
        <span>{ticker}</span>
        <strong>{position?.netStance ?? "待聚合"}</strong>
      </div>
      <div className="ticker-card-body">
        <div className="ticker-card-summary compact">
          <Field label="最新动作" value={latestAction} tone={actionTone(latestAction)} />
          <Field label="资料数量" value={`${tickerHoldings.length} 条`} tone="neutral" />
          <Field label="来源数量" value={`${sourceCount} 个`} tone="neutral" />
          <Field label="最后更新" value={lastUpdated ? formatShortDate(lastUpdated) : "暂无"} tone="neutral" />
        </div>
        <div className="ticker-latest-signal">
          <span>最近信号</span>
          <strong className={toneClass[actionTone(latestEvent?.action ?? latestHolding?.lastAction ?? "观察")]}>
            {latestEvent ? `${latestEvent.action} · ${formatShortDate(latestEvent.createdAt)}` : latestHolding ? `${latestHolding.lastAction} · ${sourceDisplayName(latestHolding)}` : "暂无"}
          </strong>
          <p>{latestSummary}</p>
        </div>
        <div className="ticker-card-actions">
          <button className={isSelected ? "active" : undefined} onClick={onShowRecords} type="button">查看记录</button>
          <button onClick={onAsk} type="button">问这个标的</button>
          <button
            className="danger-outline"
            disabled={isArchiving || tickerHoldings.length === 0}
            onClick={onArchive}
            type="button"
          >
            {isArchiving ? "正在移出" : "移出资料库"}
          </button>
        </div>
      </div>
    </section>
  );
}

function TickerRecordsPanel({
  events,
  holdings,
  limit,
  onAsk,
  onClose,
  onLoadMore,
  onOpenEvidence,
  position,
  ticker
}: {
  events: HoldingEvent[];
  holdings: HoldingRecord[];
  limit: number;
  onAsk: () => void;
  onClose: () => void;
  onLoadMore: () => void;
  onOpenEvidence: (id: string) => void;
  position?: PortfolioPosition;
  ticker: string;
}) {
  const eventByHoldingId = new Map<string, HoldingEvent[]>();
  const [actionFilter, setActionFilter] = useState<"all" | SignalAction>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | ResearchSourceType>("all");
  const [timeWindow, setTimeWindow] = useState<"all" | "7d" | "30d">("all");

  for (const event of events) {
    eventByHoldingId.set(event.holdingId, [...(eventByHoldingId.get(event.holdingId) ?? []), event]);
  }

  const cutoff = timeWindow === "all"
    ? null
    : Date.now() - (timeWindow === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
  const filteredHoldings = holdings.filter((holding) => {
    const latestEvent = [...(eventByHoldingId.get(holding.id) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const action = latestEvent?.action ?? holding.lastAction;
    const eventTime = latestEvent?.createdAt ?? holding.updatedAt;
    const matchesAction = actionFilter === "all" || action === actionFilter;
    const matchesSourceType = sourceTypeFilter === "all" || holding.sourceType === sourceTypeFilter;
    const matchesTime = !cutoff || new Date(eventTime).getTime() >= cutoff;

    return matchesAction && matchesSourceType && matchesTime;
  });
  const visibleHoldings = filteredHoldings.slice(0, limit);

  return (
    <section className="detail-pane panel ticker-records-panel">
      <div className="panel-header">
        <span>{ticker} 记录</span>
        <strong>{filteredHoldings.length}/{holdings.length} 条资料 · {position?.netStance ?? "待聚合"}</strong>
      </div>
      <div className="ticker-records-summary">
        <Field label="聚合方向" value={position?.netStance ?? "待聚合"} tone={position ? stanceTone(position.netStance) : "neutral"} />
        <Field label="最新动作" value={position?.latestAction ?? "暂无"} tone={actionTone(position?.latestAction ?? "观察")} />
        <Field label="来源数量" value={`${position?.sourceCount ?? new Set(holdings.map((holding) => sourceDisplayName(holding))).size} 个`} tone="neutral" />
        <Field label="最后更新" value={position?.lastUpdated ? formatShortDate(position.lastUpdated) : "暂无"} tone="neutral" />
      </div>
      <div className="ticker-record-filter-bar">
        <label>
          <span>时间</span>
          <select onChange={(event) => setTimeWindow(event.target.value as "all" | "7d" | "30d")} value={timeWindow}>
            <option value="all">全部时间</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
        </label>
        <label>
          <span>动作</span>
          <select onChange={(event) => setActionFilter(event.target.value as "all" | SignalAction)} value={actionFilter}>
            <option value="all">全部动作</option>
            {signalActionOptions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </label>
        <label>
          <span>来源类型</span>
          <select onChange={(event) => setSourceTypeFilter(event.target.value as "all" | ResearchSourceType)} value={sourceTypeFilter}>
            <option value="all">全部来源</option>
            {researchSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="ticker-records-toolbar">
        <button onClick={onAsk} type="button">问这个标的</button>
        <button onClick={onClose} type="button">收起记录</button>
      </div>
      <div className="ticker-record-list">
        {visibleHoldings.length === 0 ? (
          <p className="empty-state">当前筛选下没有这个标的的已入库资料。</p>
        ) : (
          visibleHoldings.map((holding) => (
            <TickerRecordRow
              events={eventByHoldingId.get(holding.id) ?? []}
              holding={holding}
              key={holding.id}
              onOpenEvidence={onOpenEvidence}
            />
          ))
        )}
      </div>
      {filteredHoldings.length > visibleHoldings.length && (
        <button className="panel-link-button ticker-record-load-more" onClick={onLoadMore} type="button">
          继续加载 {Math.min(20, filteredHoldings.length - visibleHoldings.length)} 条
        </button>
      )}
    </section>
  );
}

function TickerRecordRow({
  events,
  holding,
  onOpenEvidence
}: {
  events: HoldingEvent[];
  holding: HoldingRecord;
  onOpenEvidence: (id: string) => void;
}) {
  const latestEvent = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const summary = latestEvent?.summary
    ? hideConfidenceText(latestEvent.summary)
    : `${sourceDisplayName(holding)} · ${formatSourceType(holding.sourceType)}`;
  const date = holding.publishedAt ?? holding.reportingPeriod ?? formatShortDate(latestEvent?.createdAt ?? holding.updatedAt);

  return (
    <button className="ticker-record-row" onClick={() => onOpenEvidence(holding.sourceIngestItemId)} type="button">
      <div>
        <strong className={toneClass[actionTone(latestEvent?.action ?? holding.lastAction)]}>
          {latestEvent?.action ?? holding.lastAction}
        </strong>
        <span>{sourceDisplayName(holding)} · {formatSourceType(holding.sourceType)} · {date}</span>
      </div>
      <p>{summary}</p>
      <em>打开完整资料</em>
    </button>
  );
}

function EvidenceDetailDrawer({
  ingestItemId,
  onAskTicker,
  onClose,
  onOpenTicker
}: {
  ingestItemId: string;
  onAskTicker: (ticker: string) => void;
  onClose: () => void;
  onOpenTicker: (ticker: string) => void;
}) {
  const [item, setItem] = useState<IngestItem | null>(null);
  const [candidates, setCandidates] = useState<ExtractionCandidate[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("正在读取原始资料...");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setItem(null);
    setCandidates([]);
    setImageUrl(null);
    setStatus("正在读取原始资料...");

    fetchIngestItem(ingestItemId, controller.signal)
      .then(async (nextItem) => {
        if (controller.signal.aborted) {
          return;
        }

        setItem(nextItem);
        setStatus("原始资料已读取");

        const [candidateResult, imageResult] = await Promise.allSettled([
          fetchExtractionCandidates(ingestItemId),
          nextItem.kind === "screenshot" && nextItem.storageObjectKey
            ? fetchIngestImageUrl(ingestItemId)
            : Promise.resolve(null)
        ]);

        if (controller.signal.aborted) {
          return;
        }

        if (candidateResult.status === "fulfilled") {
          setCandidates(candidateResult.value);
        }

        if (imageResult.status === "fulfilled" && imageResult.value) {
          setImageUrl(imageResult.value.url);
        } else if (nextItem.kind === "screenshot" && nextItem.storageObjectKey) {
          setStatus("资料已读取，图片预览暂不可用");
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        console.error("Evidence detail load failed", error);
        setStatus("无法读取原始资料");
      });

    return () => controller.abort();
  }, [ingestItemId]);

  return (
    <div className="evidence-overlay" role="presentation" onClick={onClose}>
      <aside
        aria-label="资料详情"
        className="evidence-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="evidence-drawer-header">
          <div>
            <span>Evidence Detail</span>
            <h2>{item ? `${item.ticker} / 资料详情` : "资料详情"}</h2>
          </div>
          <button aria-label="关闭资料详情" onClick={onClose} type="button">X</button>
        </div>
        <p className="evidence-status">{status}</p>
        {item && (
          <div className="evidence-content">
            <div className="evidence-meta-grid">
              <Field label="Ticker" value={item.ticker} tone="positive" />
              <Field label="状态" value={item.status} tone={ingestStatusTone[item.status]} />
              <Field label="资料类型" value={item.kind} tone="neutral" />
              <Field label="来源主体" value={sourceDisplayName(item)} tone="neutral" />
              <Field label="来源类型" value={formatSourceType(item.sourceType)} tone="neutral" />
              {item.publishedAt && <Field label="资料日期" value={item.publishedAt} tone="neutral" />}
              {item.reportingPeriod && <Field label="报告期" value={item.reportingPeriod} tone="neutral" />}
            </div>
            <section className="evidence-section">
              <h3>资料结论</h3>
              <p>{getUserFacingSourceSummary(item) || "暂无资料摘要。"}</p>
            </section>
            <div className="evidence-actions">
              <button onClick={() => onOpenTicker(candidates.find((candidate) => isValidEditableTicker(candidate.ticker))?.ticker ?? item.extractedTicker ?? item.ticker)} type="button">
                打开标的资料库
              </button>
              <button onClick={() => onAskTicker(candidates.find((candidate) => isValidEditableTicker(candidate.ticker))?.ticker ?? item.extractedTicker ?? item.ticker)} type="button">
                问这个标的
              </button>
            </div>
            <section className="evidence-section">
              <h3>{item.kind === "screenshot" ? "原始图片" : "原始内容"}</h3>
              {imageUrl && <img alt={`${item.ticker} 原始资料`} src={imageUrl} />}
              <p>{getOriginalEvidenceContent(item)}</p>
            </section>
            <section className="evidence-section">
              <h3>关联标的信号</h3>
              {candidates.length === 0 ? (
                <p>暂无标的信号。</p>
              ) : (
                <div className="evidence-candidate-list">
                  {candidates.map((candidate) => (
                    <div className="evidence-candidate" key={candidate.id}>
                      <strong>{candidate.ticker} / {candidate.action}</strong>
                      <span>{describeCandidateStatus(candidate)} · {formatShortDate(candidate.createdAt)}</span>
                      <p>{hideConfidenceText(candidate.summary)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function IngestView({
  focusedIngestId,
  onAccepted
}: {
  focusedIngestId: string | null;
  onAccepted: (ticker: string) => void;
}) {
  const [items, setItems] = useState<IngestItem[]>([]);
  const [selectedId, setSelectedId] = useState(focusedIngestId ?? "");
  const [statusText, setStatusText] = useState("正在连接 API...");
  const [isMutating, setIsMutating] = useState(false);
  const [newIngestMode, setNewIngestMode] = useState<NewIngestMode>("link");
  const [linkValue, setLinkValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceType, setNewSourceType] = useState<ResearchSourceType>("kol_post");
  const [newPublishedAt, setNewPublishedAt] = useState("");
  const [newReportingPeriod, setNewReportingPeriod] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<SelectedImageFile | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [extractionCandidates, setExtractionCandidates] = useState<ExtractionCandidate[]>([]);
  const [editTicker, setEditTicker] = useState("");
  const [editAction, setEditAction] = useState<SignalAction>("观察");
  const [editConfidence, setEditConfidence] = useState("0.00");
  const [editSummary, setEditSummary] = useState("");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editSourceName, setEditSourceName] = useState("");
  const [editSourceType, setEditSourceType] = useState<ResearchSourceType>("other");
  const [editPublishedAt, setEditPublishedAt] = useState("");
  const [editReportingPeriod, setEditReportingPeriod] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const acceptedItems = items.filter((item) => item.status === "已接受");
  const archivedItems = items.filter((item) => item.status === "已存档");
  const activeItems = items.filter((item) => item.status !== "已驳回");

  useEffect(() => {
    if (!focusedIngestId) return;

    setSelectedId(focusedIngestId);
  }, [focusedIngestId]);

  useEffect(() => {
    const controller = new AbortController();

    fetchIngestItems(controller.signal)
      .then((payload) => {
        setItems(payload);
        setSelectedId((currentId) => {
          if (focusedIngestId && payload.some((item) => item.id === focusedIngestId)) return focusedIngestId;
          if (currentId && payload.some((item) => item.id === currentId)) return currentId;
          return payload[0]?.id ?? "";
        });
        setStatusText("API 已连接");
      })
      .catch(() => {
        setItems([]);
        setSelectedId("");
        setStatusText("API 不可用，无法读取资料");
      });

    return () => controller.abort();
  }, [focusedIngestId]);

  function replaceItem(nextItem: IngestItem) {
    setItems((currentItems) => currentItems.map((item) => (item.id === nextItem.id ? nextItem : item)));
    setSelectedId(nextItem.id);
  }

  function prependItem(nextItem: IngestItem) {
    setItems((currentItems) => [nextItem, ...currentItems]);
    setSelectedId(nextItem.id);
  }

  function upsertItem(nextItem: IngestItem) {
    setItems((currentItems) => {
      const exists = currentItems.some((item) => item.id === nextItem.id);
      if (!exists) return [nextItem, ...currentItems];
      return currentItems.map((item) => (item.id === nextItem.id ? nextItem : item));
    });
    setSelectedId(nextItem.id);
  }

  useEffect(() => {
    setPreviewImageUrl(null);
    setPreviewStatus(null);
    setExtractionCandidates([]);
    setEditingCandidateId(null);

    if (!selectedId) return;

    fetchExtractionCandidates(selectedId)
      .then(setExtractionCandidates)
      .catch(() => setExtractionCandidates([]));
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;

    setEditTicker(selected.extractedTicker ?? selected.ticker);
    setEditAction(selected.extractedAction ?? "观察");
    setEditConfidence(selected.extractedConfidence ?? selected.confidence);
    setEditSummary(selected.extractionSummary ?? "");
    setEditingCandidateId(null);
    setEditSourceName(selected.sourceName ?? "");
    setEditSourceType(selected.sourceType ?? "other");
    setEditPublishedAt(selected.publishedAt?.slice(0, 10) ?? "");
    setEditReportingPeriod(selected.reportingPeriod ?? "");
  }, [selected]);

  async function runMutation(action: () => Promise<IngestItem>, successText: string) {
    if (!selected) return undefined;

    setIsMutating(true);

    try {
      const nextItem = await action();
      replaceItem(nextItem);
      setStatusText(successText);
      return nextItem;
    } catch {
      setStatusText("API 写入失败，请确认后端服务状态");
      return undefined;
    } finally {
      setIsMutating(false);
    }
  }

  async function refreshCandidates(id: string) {
    const candidates = await fetchExtractionCandidates(id);
    setExtractionCandidates(candidates);
    return candidates;
  }

  async function handleAcceptSelected() {
    if (!selected) return;

    const validCandidates = extractionCandidates.filter((candidate) => isValidEditableTicker(candidate.ticker));

    if (validCandidates.length === 0 && isValidEditableTicker(editTicker)) {
      await handleSaveSignal();
    }

    const nextCandidates = extractionCandidates.some((candidate) => isValidEditableTicker(candidate.ticker))
      ? extractionCandidates
      : await refreshCandidates(selected.id);
    const acceptedCount = nextCandidates.filter((candidate) => isValidEditableTicker(candidate.ticker)).length;
    const nextItem = await runMutation(
      () => acceptIngestItem(selected.id),
      acceptedCount > 1
        ? `${selected.id} 已加入 ${acceptedCount} 条标的信号，正在打开标的资料库`
        : `${selected.id} 已加入资料库，正在打开标的资料库`
    );

    if (!nextItem) return;

    onAccepted((nextItem.extractedTicker ?? nextItem.ticker).toUpperCase());
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedImageFile(null);
      return;
    }

    setSelectedImageFile({
      file,
      name: file.name,
      size: file.size,
      type: file.type || "unknown"
    });
  }

  async function handleCreateIngestItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newSourceName.trim()) {
      setStatusText("请填写来源主体，例如 KOL 名称或基金名称");
      return;
    }

    if (newIngestMode === "screenshot" && !selectedImageFile) {
      setStatusText("请先选择图片文件");
      return;
    }

    const request = newIngestMode === "screenshot" ? null : buildCreateIngestRequest();

    if (newIngestMode !== "screenshot" && !request) {
      setStatusText("请先填写录入内容");
      return;
    }

    setIsMutating(true);

    try {
      const isScreenshot = newIngestMode === "screenshot";
      const createdItem = isScreenshot
        ? await uploadIngestImage(selectedImageFile!.file)
        : await createIngestItem(request as CreateIngestItemRequest);
      const item = isScreenshot
        ? await updateIngestItem(createdItem.id, { ...buildNewSourceMetadata(), status: "待复核" })
        : createdItem;
      prependItem(item);
      setStatusText(`${item.id} 已导入，正在自动解析`);
      setLinkValue("");
      setTextValue("");
      setSelectedImageFile(null);
      setNewSourceName("");
      setNewPublishedAt("");
      setNewReportingPeriod("");

      await autoProcessIngestItem(item);
    } catch {
      setStatusText("新增录入失败，请确认后端服务状态");
    } finally {
      setIsMutating(false);
    }
  }

  async function autoProcessIngestItem(item: IngestItem) {
    try {
      setStatusText(`${item.id} 正在识别标的、观点和来源`);
      const extractedItem = await extractIngestItem(item.id);
      upsertItem(extractedItem);
      const candidates = await fetchExtractionCandidates(item.id);
      setExtractionCandidates(candidates);

      try {
        const acceptedItem = await acceptIngestItem(item.id);
        upsertItem(acceptedItem);
        const acceptedCount = candidates.filter((candidate) => isValidEditableTicker(candidate.ticker)).length;
        setStatusText(acceptedCount > 1
          ? `${item.id} 已自动入库 ${acceptedCount} 条标的信号`
          : `${item.id} 已自动入库`
        );
        onAccepted((acceptedItem.extractedTicker ?? acceptedItem.ticker).toUpperCase());
      } catch {
        const archivedItem = await updateIngestItem(item.id, {
          status: "已存档",
          extractionSummary: extractedItem.extractionSummary ?? "AI 未识别出明确可入库 ticker，原始资料已存档。"
        });
        upsertItem(archivedItem);
        setStatusText(`${item.id} 未识别出明确标的，已存档`);
      }
    } catch {
      const archivedItem = await updateIngestItem(item.id, {
        status: "已存档",
        extractionSummary: "AI 解析失败，原始资料已存档。"
      });
      upsertItem(archivedItem);
      setStatusText(`${item.id} 解析失败，已存档`);
    }
  }

  async function handleLoadImagePreview() {
    if (!selected?.storageObjectKey) return;

    setIsMutating(true);

    try {
      const payload = await fetchIngestImageUrl(selected.id);
      setPreviewImageUrl(payload.url);
      setPreviewStatus(`预览链接 ${Math.floor(payload.expiresInSeconds / 60)} 分钟内有效`);
    } catch {
      setPreviewStatus("图片预览链接生成失败");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleExtractSelected() {
    if (!selected) return;

    setIsMutating(true);
    setStatusText(selected.kind === "screenshot" ? "正在调用 Vision 解析..." : "正在调用文本解析...");

    try {
      const nextItem = await extractIngestItem(selected.id);
      replaceItem(nextItem);
      const candidates = await refreshCandidates(selected.id);
      const latestCandidate = candidates[0];
      const statusLabel = latestCandidate ? describeCandidateStatus(latestCandidate) : "已生成候选字段";
      setStatusText(`${selected.id} ${statusLabel}`);
    } catch {
      setStatusText("AI 解析失败，请确认后端服务状态");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSaveEdits() {
    if (!selected) return;

    await runMutation(
      () => updateIngestItem(selected.id, {
        sourceName: editSourceName.trim() || undefined,
        sourceType: editSourceType,
        publishedAt: editPublishedAt || undefined,
        reportingPeriod: editReportingPeriod.trim() || undefined
      }),
      `${selected.id} 来源信息已保存`
    );
  }

  async function handleSaveSignal() {
    if (!selected) return;

    const ticker = editTicker.trim().toUpperCase() || "UNKNOWN";
    const confidence = normalizeEditableConfidence(editConfidence);
    const summary = editSummary.trim() || `人工修改候选 ticker=${ticker}，action=${editAction}。`;

    if (!isValidEditableTicker(ticker)) {
      setStatusText("请先填写明确 ticker，UNKNOWN 不会加入资料库");
      return;
    }

    setIsMutating(true);

    try {
      if (editingCandidateId) {
        await updateExtractionCandidate(editingCandidateId, {
          ticker,
          action: editAction,
          confidence,
          summary,
          status: "success"
        });
        setStatusText(`${ticker} 信号已更新`);
      } else {
        await createExtractionCandidate(selected.id, {
          provider: "rule_v1",
          ticker,
          action: editAction,
          confidence,
          summary,
          status: "success",
          fallbackUsed: false,
          retryable: false
        });
        setStatusText(`${ticker} 信号已添加`);
      }

      await updateIngestItem(selected.id, {
        ticker,
        confidence,
        status: Number(confidence) >= 0.8 ? "可接受" : "需人工确认",
        extractedTicker: ticker,
        extractedAction: editAction,
        extractedConfidence: confidence,
        extractionSummary: summary,
        extractedAt: new Date().toISOString()
      });
      await refreshCandidates(selected.id);
      setEditingCandidateId(null);
    } catch {
      setStatusText("候选信号保存失败，请确认后端服务状态");
    } finally {
      setIsMutating(false);
    }
  }

  function applyCandidateToEditor(candidate: ExtractionCandidate) {
    setEditingCandidateId(candidate.id);
    setEditTicker(candidate.ticker);
    setEditAction(candidate.action);
    setEditConfidence(candidate.confidence);
    setEditSummary(candidate.summary);
    setStatusText(`${candidate.id} 已应用到编辑表单`);
  }

  async function handleDeleteCandidate(candidate: ExtractionCandidate) {
    if (!selected) return;

    setIsMutating(true);

    try {
      await deleteExtractionCandidate(candidate.id);
      await refreshCandidates(selected.id);
      if (editingCandidateId === candidate.id) setEditingCandidateId(null);
      setStatusText(`${candidate.ticker} 信号已移除`);
    } catch {
      setStatusText("候选信号移除失败");
    } finally {
      setIsMutating(false);
    }
  }

  function buildCreateIngestRequest(): CreateIngestItemRequest | null {
    const sourceMetadata = buildNewSourceMetadata();

    if (newIngestMode === "link") {
      const link = linkValue.trim();
      return link ? { source: link, ...sourceMetadata, kind: "link", rawText: link, ticker: "UNKNOWN" } : null;
    }

    if (newIngestMode === "text") {
      const text = textValue.trim();
      return text ? { source: "用户粘贴文本", ...sourceMetadata, kind: "text", rawText: text, ticker: "UNKNOWN" } : null;
    }

    return null;
  }

  function buildNewSourceMetadata() {
    return {
      sourceName: newSourceName.trim(),
      sourceType: newSourceType,
      publishedAt: newPublishedAt || undefined,
      reportingPeriod: newReportingPeriod.trim() || undefined
    };
  }

  return (
    <div className="ingest-grid">
      <div className="ingest-list-column">
        <section className="workspace-section panel ingest-import-panel">
          <div className="panel-header">
            <span>导入中心</span>
            <strong>AI 自动整理</strong>
          </div>
          <p className="ingest-panel-copy">粘贴资料后系统会自动解析并入库；无法识别明确 ticker 的内容会保留为存档。</p>
          <form className="new-ingest-form" onSubmit={handleCreateIngestItem}>
            <div className="segmented-control">
              <button className={newIngestMode === "link" ? "active" : undefined} onClick={() => setNewIngestMode("link")} type="button">链接</button>
              <button className={newIngestMode === "text" ? "active" : undefined} onClick={() => setNewIngestMode("text")} type="button">文本</button>
              <button
                className={newIngestMode === "screenshot" ? "active" : undefined}
                disabled={publicDemoMode}
                onClick={() => setNewIngestMode("screenshot")}
                title={publicDemoMode ? "公开演示不接收图片资料" : undefined}
                type="button"
              >
                图片
              </button>
            </div>
            <div className="source-metadata-grid">
              <input
                className="terminal-input"
                onChange={(event) => setNewSourceName(event.target.value)}
                placeholder="来源主体，如 @KOL 或 Fund Name"
                required
                value={newSourceName}
              />
              <select
                className="terminal-select"
                onChange={(event) => setNewSourceType(event.target.value as ResearchSourceType)}
                value={newSourceType}
              >
                {researchSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                className="terminal-input"
                onChange={(event) => setNewPublishedAt(event.target.value)}
                type="date"
                value={newPublishedAt}
              />
              <input
                className="terminal-input"
                onChange={(event) => setNewReportingPeriod(event.target.value)}
                placeholder="报告期，例如 2026 Q1"
                value={newReportingPeriod}
              />
            </div>
            {newIngestMode === "link" && (
              <input
                className="terminal-input"
                onChange={(event) => setLinkValue(event.target.value)}
                placeholder="https://..."
                type="url"
                value={linkValue}
              />
            )}
            {newIngestMode === "text" && (
              <textarea
                className="terminal-textarea"
                onChange={(event) => setTextValue(event.target.value)}
                placeholder="粘贴需要解析的文字..."
                value={textValue}
              />
            )}
            {newIngestMode === "screenshot" && (
              <label className="file-picker">
                <input accept="image/*" onChange={handleImageChange} type="file" />
                <span>{selectedImageFile ? selectedImageFile.name : "选择图片文件"}</span>
              </label>
            )}
            <button className="submit-ingest" disabled={isMutating} type="submit">
              {isMutating ? "正在整理..." : "导入并自动整理"}
            </button>
          </form>
        </section>

        <section className="rail-list panel ingest-results-panel">
          <div className="panel-header">
            <span>最近导入</span>
            <strong>{statusText}</strong>
          </div>
          <div className="ingest-result-metrics">
            <div>
              <span>已入库</span>
              <strong>{acceptedItems.length}</strong>
            </div>
            <div>
              <span>已存档</span>
              <strong>{archivedItems.length}</strong>
            </div>
            <div>
              <span>总资料</span>
              <strong>{activeItems.length}</strong>
            </div>
          </div>
          <div className="queue-list">
            {items.length === 0 ? (
              <p className="empty-state">暂无导入记录。可以直接在上方粘贴资料。</p>
            ) : (
              items.map((item) => (
                <button
                  className={item.id === selectedId ? "data-row queue-item active" : "data-row queue-item"}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <span>{item.id}</span>
                  <strong>{item.extractedTicker ?? item.ticker}</strong>
                  <em className={toneClass[ingestStatusTone[item.status]]}>{item.status}</em>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="detail-pane panel review-panel">
        <div className="panel-header">
          <span>资料详情</span>
          <strong>{selected ? selected.status : "等待导入"}</strong>
        </div>
        {!selected ? (
          <p className="empty-state">新增资料后会在这里显示 AI 整理结果、原始资料和纠错入口。</p>
        ) : (
          <>
            <div className="review-source">{sourceDisplayName(selected)} · {formatSourceType(selected.sourceType)} · {selected.kind}</div>
            {selected.kind === "screenshot" && selected.storageObjectKey && (
              <div className="image-preview-block">
                <button disabled={isMutating} onClick={handleLoadImagePreview} type="button">生成图片预览</button>
                {previewStatus && <span>{previewStatus}</span>}
                {previewImageUrl && <img alt={selected.fileName ?? "上传图片预览"} src={previewImageUrl} />}
              </div>
            )}
            <div className="source-summary">
              <span>资料摘要</span>
              <p>{getUserFacingSourceSummary(selected)}</p>
            </div>
            <div className="field-grid">
              <Field label="Ticker" value={selected.extractedTicker ?? selected.ticker} tone={selected.status === "已存档" ? "neutral" : "positive"} />
              <Field label="Status" value={selected.status} tone={ingestStatusTone[selected.status]} />
              <Field label="识别动作" value={selected.extractedAction ?? "待解析"} tone={selected.extractedAction ? "warning" : "neutral"} />
              <Field label="资料结论" value={selected.extractionSummary ? hideConfidenceText(selected.extractionSummary) : "尚未解析"} tone={selected.extractionSummary ? "positive" : "neutral"} />
              <Field label="资料日期" value={selected.publishedAt ?? "待补充"} tone="neutral" />
              <Field label="报告期" value={selected.reportingPeriod ?? "不适用"} tone="neutral" />
              <Field label="进入分析" value={selected.status === "已接受" ? "已进入分布和资料库" : selected.status === "已存档" ? "仅保留原始资料" : "处理中"} tone={selected.status === "已接受" ? "positive" : "neutral"} />
            </div>
            <details className="advanced-correction">
              <summary>纠错与高级操作</summary>
            <div className="edit-grid">
              <label>
                <span>来源主体</span>
                <input
                  className="terminal-input"
                  onChange={(event) => setEditSourceName(event.target.value)}
                  placeholder="KOL 或基金名称"
                  value={editSourceName}
                />
              </label>
              <label>
                <span>来源类型</span>
                <select
                  className="terminal-select"
                  onChange={(event) => setEditSourceType(event.target.value as ResearchSourceType)}
                  value={editSourceType}
                >
                  {researchSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>资料日期</span>
                <input
                  className="terminal-input"
                  onChange={(event) => setEditPublishedAt(event.target.value)}
                  type="date"
                  value={editPublishedAt}
                />
              </label>
              <label>
                <span>报告期</span>
                <input
                  className="terminal-input"
                  onChange={(event) => setEditReportingPeriod(event.target.value)}
                  placeholder="例如 2026 Q1"
                  value={editReportingPeriod}
                />
              </label>
              <label>
                <span>Ticker</span>
                <input
                  className="terminal-input"
                  onChange={(event) => setEditTicker(event.target.value)}
                  value={editTicker}
                />
              </label>
              <label>
                <span>Action</span>
                <select
                  className="terminal-select"
                  onChange={(event) => setEditAction(event.target.value as SignalAction)}
                  value={editAction}
                >
                  {signalActions.map((action) => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
              </label>
              <label className="edit-summary">
                <span>Summary</span>
                <textarea
                  className="terminal-textarea"
                  onChange={(event) => setEditSummary(event.target.value)}
                  value={editSummary}
                />
              </label>
            </div>
            <div className="candidate-history">
              <div className="candidate-history-title">
                候选标的信号
                <button
                  disabled={isMutating}
                  onClick={() => {
                    setEditingCandidateId(null);
                    setEditTicker("");
                    setEditAction("观察");
                    setEditConfidence("0.70");
                    setEditSummary("");
                  }}
                  type="button"
                >
                  新增信号
                </button>
              </div>
              {extractionCandidates.length === 0 ? (
                <p>暂无候选信号。可以 AI 解析，或手动添加 ticker 后保存信号。</p>
              ) : (
                extractionCandidates.map((candidate) => (
                  <div className={editingCandidateId === candidate.id ? "candidate-row active" : "candidate-row"} key={candidate.id}>
                    <div className="candidate-row-header">
                      <strong>{candidate.ticker} / {candidate.action}</strong>
                      <div className="candidate-row-actions">
                        <button
                          disabled={isMutating}
                          onClick={() => applyCandidateToEditor(candidate)}
                          type="button"
                        >
                          编辑
                        </button>
                        <button
                          disabled={isMutating}
                          onClick={() => handleDeleteCandidate(candidate)}
                          type="button"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    <span>
                      {candidate.provider} · <em className={toneClass[candidateStatusTone(candidate)]}>{describeCandidateStatus(candidate)}</em>
                      {candidate.providerError ? ` · ${candidate.providerError}` : ""} ·{" "}
                      {new Date(candidate.createdAt).toLocaleString("zh-CN")}
                    </span>
                    <p>{hideConfidenceText(candidate.summary)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="button-row">
              <button
                disabled={isMutating}
                onClick={handleExtractSelected}
                type="button"
              >
                {extractionCandidates.length > 0 ? "重新解析" : "AI 解析"}
              </button>
              <button
                disabled={isMutating || selected.status === "已接受"}
                onClick={handleAcceptSelected}
                type="button"
              >
                重新入库
              </button>
              <button
                disabled={isMutating}
                onClick={handleSaveEdits}
                type="button"
              >
                保存来源信息
              </button>
              <button
                disabled={isMutating}
                onClick={handleSaveSignal}
                type="button"
              >
                {editingCandidateId ? "保存信号" : "添加信号"}
              </button>
              <button
                disabled={isMutating || selected.status === "已驳回"}
                onClick={() => runMutation(
                  () => rejectIngestItem(selected.id, {
                    reviewer: "local-user",
                    reason: "人工复核判定为暂不采纳"
                  }),
                  `${selected.id} 已驳回`
                )}
                type="button"
              >
                驳回
              </button>
              <button
                disabled={isMutating}
                onClick={() => runMutation(
                  () => updateIngestItem(selected.id, { status: "需人工确认" }),
                  `${selected.id} 已转入人工处理`
                )}
                type="button"
              >
                手动处理
              </button>
            </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
}

function SettingsView({ accountLabel, onSignOut }: { accountLabel: string; onSignOut?: () => Promise<void> }) {
  const [statusText, setStatusText] = useState("");
  const [isMutating, setIsMutating] = useState(false);

  async function handleExportData() {
    setIsMutating(true);

    try {
      const payload = await exportAccountData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `portfolio-intelligence-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusText("资料库 JSON 已导出");
    } catch {
      setStatusText("导出失败，请确认 API 状态");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDeleteData() {
    if (!window.confirm("这会删除当前资料库中的录入、候选、持仓、事件和质量记录。确认继续？")) return;

    setIsMutating(true);

    try {
      const result = await deleteAccountData();
      setStatusText(`已删除资料：录入 ${result.deleted.ingestItems}，持仓 ${result.deleted.holdings}，事件 ${result.deleted.holdingEvents}`);
    } catch {
      setStatusText("删除失败，请确认 API 状态");
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <div className="settings-grid">
      <section className="workspace-section panel settings-panel">
        <div className="panel-header">
          <span>账户与数据</span>
          {statusText && <strong>{statusText}</strong>}
        </div>
        <div className="settings-copy">
          <p>当前账户：{accountLabel}。资料、候选、持仓和问答检索均按当前账户隔离。</p>
          <p>{publicDemoMode ? "演示数据仅在当前服务进程内保留，不接收图片上传。" : "可以导出当前资料库 JSON；删除会同时移除当前账户的资料记录和已上传截图。"}</p>
        </div>
        <div className="settings-actions">
          <button disabled={isMutating} onClick={handleExportData} type="button">导出资料库 JSON</button>
          <button className="danger" disabled={isMutating} onClick={handleDeleteData} type="button">删除当前资料库数据</button>
          {onSignOut && <button disabled={isMutating} onClick={() => void onSignOut()} type="button">退出登录</button>}
        </div>
      </section>

      <section className="workspace-section panel settings-panel">
        <div className="panel-header">
          <span>资料使用说明</span>
          <strong>仅基于资料库</strong>
        </div>
        <div className="settings-copy">
          <p>{publicDemoMode ? "当前为合成数据演示模式，不启用图片存储或外部模型服务。" : "截图和文本会存入后端；图片预览使用短期 signed URL。"}</p>
          <p>点击 AI 解析或问资料库时，系统只会使用完成任务所需的图片、文本或检索上下文。</p>
          <p>问资料库不允许补充资料库以外的事实、实时行情或投资建议。</p>
        </div>
      </section>
    </div>
  );
}

function SourcesView({
  sourceItems,
  selectedSource,
  onSelectSource,
  onSourceSaved,
  sourcesStatus
}: {
  sourceItems: SourceItem[];
  selectedSource: SourceItem;
  onSelectSource: (source: SourceItem) => void;
  onSourceSaved: (source: SourceItem) => void;
  sourcesStatus: "api" | "fallback" | "loading";
}) {
  const [editStatus, setEditStatus] = useState(selectedSource.status);
  const [editParser, setEditParser] = useState(selectedSource.parser);
  const [saveStatus, setSaveStatus] = useState("未保存");
  const [isSaving, setIsSaving] = useState(false);
  const [qualityEvents, setQualityEvents] = useState<QualityEvent[]>([]);

  useEffect(() => {
    setEditStatus(selectedSource.status);
    setEditParser(selectedSource.parser);
    setSaveStatus("未保存");
    fetchQualityEvents(selectedSource.name)
      .then(setQualityEvents)
      .catch(() => setQualityEvents([]));
  }, [selectedSource]);

  async function handleSaveSource() {
    setIsSaving(true);

    try {
      const nextSource = await updateSource(selectedSource.name, {
        status: editStatus,
        parser: editParser
      });
      onSourceSaved(nextSource);
      setQualityEvents(await fetchQualityEvents(nextSource.name));
      setSaveStatus("已保存");
    } catch {
      setSaveStatus("保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="sources-grid">
      <section className="panel">
        <div className="panel-header">
          <span>数据源列表</span>
          <strong>{sourcesStatus === "api" ? "API 实时" : sourcesStatus === "loading" ? "加载中" : "Mock Fallback"}</strong>
        </div>
        <table className="terminal-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>平台</th>
              <th>类型</th>
              <th>状态</th>
              <th>最近同步</th>
              <th>记录数</th>
            </tr>
          </thead>
          <tbody>
            {sourceItems.map((source) => (
              <tr
                className={source.name === selectedSource.name ? "selected-row" : undefined}
                key={source.name}
                onClick={() => onSelectSource(source)}
              >
                <td>{source.name}</td>
                <td>{source.platform}</td>
                <td>{source.type}</td>
                <td className={source.status === "正常" ? "tone-positive" : "tone-warning"}>{source.status}</td>
                <td>{source.lastSync}</td>
                <td>{source.records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel source-detail">
        <div className="panel-header">
          <span>来源详情 / Parser 配置</span>
          <strong>{saveStatus}</strong>
        </div>
        <Field label="当前来源" value={selectedSource.name} tone="neutral" />
        <Field label="平台 / 类型" value={`${selectedSource.platform} · ${selectedSource.type}`} tone="neutral" />
        <Field label="抓取方式" value={selectedSource.type === "文件" ? "文件导入" : "手动粘贴 + 后续 API 接入"} tone="neutral" />
        <label className="source-edit-field">
          <span>状态</span>
          <input
            className="terminal-input"
            onChange={(event) => setEditStatus(event.target.value)}
            value={editStatus}
          />
        </label>
        <label className="source-edit-field">
          <span>Parser 策略</span>
          <input
            className="terminal-input"
            onChange={(event) => setEditParser(event.target.value)}
            value={editParser}
          />
        </label>
        <div className="source-status">状态：{selectedSource.status} | 最近同步：{selectedSource.lastSync} | 记录：{selectedSource.records}</div>
        <button className="save-button" disabled={isSaving} onClick={handleSaveSource} type="button">保存配置</button>
        <div className="quality-event-list">
          <span>配置变更历史</span>
          {qualityEvents.length === 0 ? (
            <p>暂无变更记录</p>
          ) : (
            qualityEvents.slice(0, 4).map((event) => (
              <div className="quality-event-row" key={event.id}>
                <strong>{event.summary}</strong>
                <em>{event.eventType} · {new Date(event.createdAt).toLocaleString("zh-CN")}</em>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="field">
      <span>{label}</span>
      <strong className={toneClass[tone]}>{value}</strong>
    </div>
  );
}
