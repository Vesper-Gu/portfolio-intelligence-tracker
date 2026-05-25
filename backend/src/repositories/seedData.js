export const seedData = {
  kols: [
    { id: "kol-investor-x", handle: "@Investor_X", platform: "twitter", displayName: "Investor X", tags: ["AI", "growth"], trustScore: 0.91, isActive: true, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-12T00:00:00.000Z" },
    { id: "kol-techfund-a", handle: "@TechFund_A", platform: "substack", displayName: "TechFund A", tags: ["tech", "semis"], trustScore: 0.87, isActive: true, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-10T00:00:00.000Z" },
    { id: "kol-macro-z", handle: "@Macro_Z", platform: "twitter", displayName: "Macro Z", tags: ["macro", "hedge"], trustScore: 0.78, isActive: true, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-08T00:00:00.000Z" }
  ],
  sources: [
    { id: "src-investor-x-twitter", name: "@Investor_X X account", sourceType: "twitter", platform: "twitter", url: "https://x.example/investor_x", status: "active", trustLevel: "high", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-12T00:00:00.000Z" },
    { id: "src-techfund-substack", name: "TechFund A Substack", sourceType: "substack", platform: "substack", url: "https://substack.example/techfund", status: "active", trustLevel: "high", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-10T00:00:00.000Z" },
    { id: "src-manual", name: "Manual entry", sourceType: "manual", platform: "app", url: null, status: "active", trustLevel: "medium", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-10T00:00:00.000Z" }
  ],
  holdings: [
    { id: "h-nvda-investor-x", kolId: "kol-investor-x", sourceId: "src-investor-x-twitter", ticker: "NVDA", assetType: "stock", action: "add", weightPct: 27, sourceText: "Added to NVDA again after earnings.", extractionConfidence: 0.94, fieldConfidence: { ticker: 0.99, weightPct: 0.94, action: 0.86 }, isVerified: true, note: "AI backlog", starred: true, userTags: ["AI"], recordedAt: "2026-05-12T08:00:00.000Z", createdAt: "2026-05-12T08:10:00.000Z", updatedAt: "2026-05-12T08:10:00.000Z" },
    { id: "h-tsla-investor-x", kolId: "kol-investor-x", sourceId: "src-investor-x-twitter", ticker: "TSLA", assetType: "stock", action: "trim", weightPct: 8, sourceText: "Trimmed TSLA on valuation risk.", extractionConfidence: 0.82, fieldConfidence: { ticker: 0.98, weightPct: 0.72, action: 0.84 }, isVerified: true, note: "valuation risk", starred: false, userTags: ["EV"], recordedAt: "2026-05-08T08:00:00.000Z", createdAt: "2026-05-08T08:10:00.000Z", updatedAt: "2026-05-08T08:10:00.000Z" },
    { id: "h-nvda-techfund-a", kolId: "kol-techfund-a", sourceId: "src-techfund-substack", ticker: "NVDA", assetType: "stock", action: "add", weightPct: 22, sourceText: "AI capex cycle remains early.", extractionConfidence: 0.91, fieldConfidence: { ticker: 0.99, weightPct: 0.88, action: 0.83 }, isVerified: true, note: "AI capex", starred: false, userTags: ["AI"], recordedAt: "2026-05-10T08:00:00.000Z", createdAt: "2026-05-10T08:10:00.000Z", updatedAt: "2026-05-10T08:10:00.000Z" },
    { id: "h-smh-macro-z", kolId: "kol-macro-z", sourceId: "src-manual", ticker: "SMH", assetType: "etf", action: "hold", weightPct: 12, sourceText: "Semis basket for AI infra.", extractionConfidence: 0.78, fieldConfidence: { ticker: 0.96, weightPct: 0.7, action: 0.77 }, isVerified: false, note: "semis basket", starred: false, userTags: ["ETF"], recordedAt: "2026-05-08T08:00:00.000Z", createdAt: "2026-05-08T08:10:00.000Z", updatedAt: "2026-05-08T08:10:00.000Z" }
  ],
  ingestItems: [
    { id: "ingest-nvda-shot", sourceId: "src-investor-x-twitter", rawText: "NVDA 27.0% ADD", sourceImageUrl: null, parsedPayload: { holdings: [{ ticker: "NVDA", weightPct: 27, action: "add", confidence: 0.94 }] }, status: "pending_review", createdAt: "2026-05-12T08:05:00.000Z", updatedAt: "2026-05-12T08:05:00.000Z" }
  ],
  alertRules: [
    { id: "alert-nvda-consensus", name: "NVDA consensus threshold", ruleType: "consensus_threshold", config: { ticker: "NVDA", minKols: 5, windowDays: 7 }, status: "active", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-12T00:00:00.000Z" }
  ],
  qualityEvents: []
};

