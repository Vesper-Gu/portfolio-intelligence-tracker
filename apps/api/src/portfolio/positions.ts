import type { DashboardPayload, HeatmapRow, HoldingEvent, HoldingRecord, PortfolioPosition, SignalAction, Tone } from "@pit/shared";

const actionScore: Record<SignalAction, number> = {
  "加仓": 1,
  "新建仓": 1,
  "持有": 0,
  "观察": 0,
  "减仓": -1,
  "风险": -1
};

const actionHeatTone: Record<SignalAction, Tone> = {
  "加仓": "positive",
  "新建仓": "positive",
  "持有": "warning",
  "观察": "warning",
  "减仓": "negative",
  "风险": "negative"
};

export function buildPortfolioPositions(
  holdings: HoldingRecord[],
  holdingEvents: HoldingEvent[]
): PortfolioPosition[] {
  const activeHoldings = holdings.filter((holding) => holding.status === "已确认");
  const activeHoldingIds = new Set(activeHoldings.map((holding) => holding.id));
  const eventsByHoldingId = new Map<string, HoldingEvent[]>();

  for (const event of holdingEvents) {
    if (!activeHoldingIds.has(event.holdingId)) continue;
    const currentEvents = eventsByHoldingId.get(event.holdingId) ?? [];
    eventsByHoldingId.set(event.holdingId, [event, ...currentEvents]);
  }

  const byTicker = new Map<string, HoldingRecord[]>();

  for (const holding of activeHoldings) {
    const ticker = holding.ticker.toUpperCase();
    byTicker.set(ticker, [...(byTicker.get(ticker) ?? []), holding]);
  }

  return [...byTicker.entries()]
    .map(([ticker, tickerHoldings]) => {
      const tickerEvents = tickerHoldings.flatMap((holding) => eventsByHoldingId.get(holding.id) ?? []);
      const actionEvents = tickerEvents.length
        ? tickerEvents.map((event) => event.action)
        : tickerHoldings.map((holding) => holding.lastAction);
      const score = actionEvents.reduce((total, action) => total + actionScore[action], 0);
      const sortedEvents = [...tickerEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const sortedHoldings = [...tickerHoldings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const latestAction = sortedEvents[0]?.action ?? sortedHoldings[0]?.lastAction ?? "观察";
      const confidences = tickerHoldings
        .map((holding) => Number(holding.confidence))
        .filter((confidence) => Number.isFinite(confidence));
      const avgConfidence = confidences.length
        ? confidences.reduce((total, confidence) => total + confidence, 0) / confidences.length
        : 0;
      const sources = [...new Set(tickerHoldings.map(sourceLabel))].sort();
      const lastUpdated = [
        ...tickerHoldings.map((holding) => holding.updatedAt),
        ...tickerEvents.map((event) => event.createdAt)
      ].sort((a, b) => b.localeCompare(a))[0] ?? new Date(0).toISOString();

      return {
        ticker,
        status: "活跃" as const,
        holdingsCount: tickerHoldings.length,
        eventCount: tickerEvents.length,
        sourceCount: sources.length,
        avgConfidence: avgConfidence.toFixed(2),
        latestAction,
        netStance: score > 0 ? "看多" as const : score < 0 ? "看空" as const : "中性" as const,
        netScore: score,
        bullishEvents: actionEvents.filter((action) => actionScore[action] > 0).length,
        bearishEvents: actionEvents.filter((action) => actionScore[action] < 0).length,
        neutralEvents: actionEvents.filter((action) => actionScore[action] === 0).length,
        sources,
        lastUpdated
      };
    })
    .sort((a, b) => {
      if (b.netScore !== a.netScore) return b.netScore - a.netScore;
      return b.lastUpdated.localeCompare(a.lastUpdated);
    });
}

export function buildEvidenceDashboard(base: DashboardPayload, holdings: HoldingRecord[]): DashboardPayload {
  const activeHoldings = holdings
    .filter((holding) => holding.status === "已确认")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const heatmapColumns = [...new Set(activeHoldings.map((holding) => holding.ticker.toUpperCase()))].slice(0, 8);
  const sourceLabels = [...new Set(activeHoldings.map(sourceLabel))].slice(0, 8);
  const latestBySourceTicker = new Map<string, HoldingRecord>();

  for (const holding of activeHoldings) {
    const key = `${sourceLabel(holding)}::${holding.ticker.toUpperCase()}`;
    if (!latestBySourceTicker.has(key)) latestBySourceTicker.set(key, holding);
  }

  const heatmapRows: HeatmapRow[] = sourceLabels.map((label) => ({
    label,
    cells: heatmapColumns.map((ticker) => {
      const holding = latestBySourceTicker.get(`${label}::${ticker}`);
      return holding ? actionHeatTone[holding.lastAction] : "empty";
    })
  }));

  return {
    ...base,
    tickerMoves: [],
    holdingSignals: [],
    evidenceItems: [],
    heatmapColumns,
    heatmapRows
  };
}

function sourceLabel(holding: HoldingRecord) {
  if (holding.sourceName) return holding.sourceName;
  if (holding.source.startsWith("storage://")) return "截图上传";

  try {
    return new URL(holding.source).hostname;
  } catch {
    return holding.source;
  }
}
