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

  return { grounded: true };
}

function uppercaseTokens(text: string) {
  return [...new Set(text.toUpperCase().match(/\b[A-Z]{2,5}(?:\.[A-Z]{2})?\b/g) ?? [])];
}
