import type { RagCitation } from "@pit/shared";

interface GroundednessInput {
  answer: string;
  contextSummary: string;
  citations: RagCitation[];
}

export interface GroundednessResult {
  grounded: boolean;
  reason?: string;
}

const ignoredUppercaseTokens = new Set(["AI", "API", "ETF", "KOL", "LLM", "OCR", "RAG", "SEC", "URL"]);
const actions = ["加仓", "增持", "买入", "持有", "减仓", "卖出", "新建仓", "建仓", "风险", "观察"];
const genericSourcePhrases = new Set(["资料库", "证据", "来源", "记录", "资料", "上下文", "引用"]);

export function validateGroundedAnswer(input: GroundednessInput): GroundednessResult {
  if (!input.citations.length) return { grounded: false, reason: "missing_citations" };

  if (/(根据常识|市场通常|实时行情|外部资料|网络搜索|我认为|建议买入|建议卖出)/i.test(input.answer)) {
    return { grounded: false, reason: "external_or_advisory_claim" };
  }

  const evidenceText = `${input.contextSummary}\n${input.citations.map((citation) => `${citation.title}\n${citation.snippet}`).join("\n")}`.toUpperCase();
  const unsupportedTokens = uppercaseTokens(input.answer)
    .filter((token) => !ignoredUppercaseTokens.has(token))
    .filter((token) => !evidenceText.includes(token));

  if (unsupportedTokens.length) {
    return { grounded: false, reason: `unsupported_token:${unsupportedTokens[0]}` };
  }

  const evidenceTickers = uppercaseTokens(evidenceText).filter((token) => !ignoredUppercaseTokens.has(token));
  const answerTickers = uppercaseTokens(input.answer).filter((token) => !ignoredUppercaseTokens.has(token));

  if (evidenceTickers.length && !answerTickers.some((token) => evidenceTickers.includes(token))) {
    return { grounded: false, reason: "missing_evidence_ticker" };
  }

  const unsupportedAction = mentionedActions(input.answer)
    .find((action) => !evidenceText.includes(action.toUpperCase()));

  if (unsupportedAction) {
    return { grounded: false, reason: `unsupported_action:${unsupportedAction}` };
  }

  const unsupportedDate = dateTokens(input.answer)
    .find((token) => !evidenceText.includes(token.toUpperCase()));

  if (unsupportedDate) {
    return { grounded: false, reason: `unsupported_time:${unsupportedDate}` };
  }

  const unsupportedSource = sourceReferences(input.answer)
    .find((source) => !evidenceText.includes(source.toUpperCase()));

  if (unsupportedSource) {
    return { grounded: false, reason: `unsupported_source:${unsupportedSource}` };
  }

  return { grounded: true };
}

function uppercaseTokens(text: string) {
  return [...new Set(text.toUpperCase().match(/\b[A-Z]{2,5}(?:\.[A-Z]{2})?\b/g) ?? [])];
}

function mentionedActions(text: string) {
  return actions.filter((action) => text.includes(action));
}

function dateTokens(text: string) {
  const isoDates = text.match(/\b20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?\b/g) ?? [];
  const shortDates = text.match(/\b\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?\b/g) ?? [];
  const chineseDates = text.match(/\b\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2})?\b/g) ?? [];

  return [...new Set([...isoDates, ...shortDates, ...chineseDates])];
}

function sourceReferences(text: string) {
  const matches = [...text.matchAll(/(?:来自|来源(?:是|为|于)?|引用自|根据)\s*([@A-Za-z0-9_\-\u4e00-\u9fa5 ]{2,40})/g)];

  return matches
    .map((match) => match[1].replace(/[。；，,.、\s]+$/g, "").trim())
    .filter((value) => value.length >= 2 && !genericSourcePhrases.has(value));
}
