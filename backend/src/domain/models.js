export const ASSET_TYPES = new Set(["stock", "crypto", "option", "etf", "other"]);
export const ACTIONS = new Set(["buy", "sell", "hold", "add", "trim", "close", "unknown"]);
export const SOURCE_TYPES = new Set(["twitter", "substack", "wechat", "13f", "terminal", "app", "article", "manual", "rss", "other"]);

export function normalizeTicker(ticker) {
  if (typeof ticker !== "string") {
    throw new ValidationError("ticker must be a string");
  }

  const normalized = ticker.trim().replace(/^\$/, "").toUpperCase();
  if (!/^[A-Z0-9.]{1,12}$/.test(normalized)) {
    throw new ValidationError(`invalid ticker: ${ticker}`);
  }
  return normalized;
}

export function normalizeWeightPct(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new ValidationError("weightPct must be between 0 and 100");
  }
  return Math.round(num * 100) / 100;
}

export function assertEnum(value, allowed, field) {
  if (!allowed.has(value)) {
    throw new ValidationError(`${field} must be one of: ${Array.from(allowed).join(", ")}`);
  }
  return value;
}

export function isoNow() {
  return new Date().toISOString();
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.code = "VALIDATION_ERROR";
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
    this.code = "NOT_FOUND";
  }
}

