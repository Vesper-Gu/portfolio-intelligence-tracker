import { randomUUID } from "node:crypto";
import { isoNow } from "../domain/models.js";

export class MemoryRepository {
  constructor(seed = {}) {
    this.kols = new Map();
    this.sources = new Map();
    this.holdings = new Map();
    this.ingestItems = new Map();
    this.alertRules = new Map();
    this.qualityEvents = [];

    for (const kol of seed.kols ?? []) this.kols.set(kol.id, { ...kol });
    for (const source of seed.sources ?? []) this.sources.set(source.id, { ...source });
    for (const holding of seed.holdings ?? []) this.holdings.set(holding.id, { ...holding });
    for (const item of seed.ingestItems ?? []) this.ingestItems.set(item.id, { ...item });
    for (const rule of seed.alertRules ?? []) this.alertRules.set(rule.id, { ...rule });
    this.qualityEvents = [...(seed.qualityEvents ?? [])];
  }

  listKols() {
    return Array.from(this.kols.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  }

  upsertKol(input) {
    const id = input.id ?? randomUUID();
    const existing = this.kols.get(id);
    const now = isoNow();
    const record = {
      id,
      handle: input.handle,
      platform: input.platform ?? "other",
      displayName: input.displayName ?? input.handle,
      tags: input.tags ?? [],
      trustScore: input.trustScore ?? 0.75,
      isActive: input.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.kols.set(id, record);
    return record;
  }

  listSources() {
    return Array.from(this.sources.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  upsertSource(input) {
    const id = input.id ?? randomUUID();
    const now = isoNow();
    const existing = this.sources.get(id);
    const record = {
      id,
      name: input.name,
      sourceType: input.sourceType ?? "other",
      platform: input.platform ?? "other",
      url: input.url ?? null,
      status: input.status ?? "active",
      trustLevel: input.trustLevel ?? "medium",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.sources.set(id, record);
    return record;
  }

  listHoldings(filter = {}) {
    return Array.from(this.holdings.values())
      .filter((holding) => !filter.kolId || holding.kolId === filter.kolId)
      .filter((holding) => !filter.ticker || holding.ticker === filter.ticker)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }

  createHolding(input) {
    const now = isoNow();
    const record = {
      id: input.id ?? randomUUID(),
      kolId: input.kolId,
      sourceId: input.sourceId ?? null,
      ticker: input.ticker,
      assetType: input.assetType,
      action: input.action,
      weightPct: input.weightPct ?? null,
      weightRank: input.weightRank ?? null,
      shares: input.shares ?? null,
      marketValueUsd: input.marketValueUsd ?? null,
      optionDirection: input.optionDirection ?? null,
      optionStrike: input.optionStrike ?? null,
      optionExpiry: input.optionExpiry ?? null,
      sourceText: input.sourceText ?? null,
      sourceImageUrl: input.sourceImageUrl ?? null,
      extractionConfidence: input.extractionConfidence ?? null,
      fieldConfidence: input.fieldConfidence ?? {},
      isVerified: input.isVerified ?? false,
      note: input.note ?? null,
      starred: input.starred ?? false,
      userTags: input.userTags ?? [],
      recordedAt: input.recordedAt ?? now,
      createdAt: now,
      updatedAt: now
    };
    this.holdings.set(record.id, record);
    return record;
  }

  listIngestItems(status) {
    return Array.from(this.ingestItems.values())
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createIngestItem(input) {
    const now = isoNow();
    const record = {
      id: input.id ?? randomUUID(),
      sourceId: input.sourceId ?? null,
      rawText: input.rawText ?? null,
      sourceImageUrl: input.sourceImageUrl ?? null,
      parsedPayload: input.parsedPayload ?? {},
      status: input.status ?? "pending_review",
      createdAt: now,
      updatedAt: now
    };
    this.ingestItems.set(record.id, record);
    return record;
  }

  updateIngestStatus(id, status) {
    const item = this.ingestItems.get(id);
    if (!item) return null;
    const updated = { ...item, status, updatedAt: isoNow() };
    this.ingestItems.set(id, updated);
    return updated;
  }

  listAlertRules() {
    return Array.from(this.alertRules.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  upsertAlertRule(input) {
    const id = input.id ?? randomUUID();
    const now = isoNow();
    const existing = this.alertRules.get(id);
    const record = {
      id,
      name: input.name,
      ruleType: input.ruleType,
      config: input.config ?? {},
      status: input.status ?? "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.alertRules.set(id, record);
    return record;
  }
}

