import {
  ACTIONS,
  ASSET_TYPES,
  NotFoundError,
  SOURCE_TYPES,
  ValidationError,
  assertEnum,
  normalizeTicker,
  normalizeWeightPct
} from "../domain/models.js";

export class PortfolioService {
  constructor(repository) {
    this.repository = repository;
  }

  listKols() {
    return this.repository.listKols();
  }

  createKol(input) {
    if (!input?.handle) throw new ValidationError("handle is required");
    return this.repository.upsertKol(input);
  }

  listSources() {
    return this.repository.listSources();
  }

  createSource(input) {
    if (!input?.name) throw new ValidationError("name is required");
    const sourceType = assertEnum(input.sourceType ?? "other", SOURCE_TYPES, "sourceType");
    return this.repository.upsertSource({ ...input, sourceType });
  }

  listHoldings(filter = {}) {
    const normalizedFilter = { ...filter };
    if (normalizedFilter.ticker) normalizedFilter.ticker = normalizeTicker(normalizedFilter.ticker);
    return this.repository.listHoldings(normalizedFilter);
  }

  createHolding(input) {
    if (!input?.kolId) throw new ValidationError("kolId is required");
    const ticker = normalizeTicker(input.ticker);
    const assetType = assertEnum(input.assetType, ASSET_TYPES, "assetType");
    const action = assertEnum(input.action, ACTIONS, "action");
    return this.repository.createHolding({
      ...input,
      ticker,
      assetType,
      action,
      weightPct: normalizeWeightPct(input.weightPct)
    });
  }

  consensusMatrix() {
    const holdings = this.repository.listHoldings();
    const byTicker = new Map();

    for (const holding of holdings) {
      const entry = byTicker.get(holding.ticker) ?? {
        ticker: holding.ticker,
        assetType: holding.assetType,
        kolIds: new Set(),
        totalWeight: 0,
        weightedCount: 0,
        addCount: 0,
        trimCount: 0,
        latestRecordedAt: holding.recordedAt
      };

      entry.kolIds.add(holding.kolId);
      if (typeof holding.weightPct === "number") {
        entry.totalWeight += holding.weightPct;
        entry.weightedCount += 1;
      }
      if (holding.action === "add" || holding.action === "buy") entry.addCount += 1;
      if (holding.action === "trim" || holding.action === "sell" || holding.action === "close") entry.trimCount += 1;
      if (holding.recordedAt > entry.latestRecordedAt) entry.latestRecordedAt = holding.recordedAt;
      byTicker.set(holding.ticker, entry);
    }

    return Array.from(byTicker.values())
      .map((entry) => ({
        ticker: entry.ticker,
        assetType: entry.assetType,
        kolCount: entry.kolIds.size,
        averageWeightPct: entry.weightedCount ? Math.round((entry.totalWeight / entry.weightedCount) * 100) / 100 : null,
        addCount: entry.addCount,
        trimCount: entry.trimCount,
        consensusScore: entry.kolIds.size * 10 + entry.addCount * 3 - entry.trimCount,
        latestRecordedAt: entry.latestRecordedAt
      }))
      .sort((a, b) => b.consensusScore - a.consensusScore);
  }

  listIngestItems(status) {
    return this.repository.listIngestItems(status);
  }

  createIngestItem(input) {
    return this.repository.createIngestItem(input ?? {});
  }

  updateIngestStatus(id, status) {
    if (!id) throw new ValidationError("id is required");
    if (!["pending_review", "accepted", "rejected", "needs_manual_review"].includes(status)) {
      throw new ValidationError("invalid ingest status");
    }
    const updated = this.repository.updateIngestStatus(id, status);
    if (!updated) throw new NotFoundError(`ingest item not found: ${id}`);
    return updated;
  }

  listAlertRules() {
    return this.repository.listAlertRules();
  }

  createAlertRule(input) {
    if (!input?.name) throw new ValidationError("name is required");
    if (!input?.ruleType) throw new ValidationError("ruleType is required");
    return this.repository.upsertAlertRule(input);
  }

  qualitySummary() {
    const holdings = this.repository.listHoldings();
    const total = holdings.length;
    const verified = holdings.filter((item) => item.isVerified).length;
    const withConfidence = holdings.filter((item) => typeof item.extractionConfidence === "number");
    const avgConfidence = withConfidence.length
      ? withConfidence.reduce((sum, item) => sum + item.extractionConfidence, 0) / withConfidence.length
      : null;

    return {
      totalHoldings: total,
      verifiedRate: total ? Math.round((verified / total) * 10000) / 100 : 0,
      averageExtractionConfidence: avgConfidence === null ? null : Math.round(avgConfidence * 10000) / 100,
      pendingReviewCount: this.repository.listIngestItems("pending_review").length
    };
  }
}

