import type { IngestItem } from "@pit/shared";
import type { ExtractionProvider } from "../extraction/provider.js";
import type { ExtractionCandidate } from "../extraction/ruleExtractor.js";
import type { Skill } from "./types.js";

interface ExtractionSkillOptions {
  provider: ExtractionProvider;
  model?: string;
}

export class ExtractTextSignalSkill implements Skill<IngestItem, ExtractionCandidate> {
  readonly name = "extract_text_signal" as const;
  readonly version = "1.0.0";
  readonly capability = "extract_signal" as const;
  readonly timeoutMs = 15_000;
  readonly maxAttempts = 2;

  constructor(private readonly options: ExtractionSkillOptions) {}

  shouldRetry(error: unknown) {
    return isRetryable(error);
  }

  async execute(item: IngestItem) {
    if (item.kind === "screenshot") throw new Error("Text extraction skill does not accept screenshots");
    const candidate = await this.options.provider.extract(item);
    return extractionResult(candidate, this.options.model);
  }
}

export class ExtractImageSignalSkill implements Skill<IngestItem, ExtractionCandidate> {
  readonly name = "extract_image_signal" as const;
  readonly version = "1.0.0";
  readonly capability = "extract_signal" as const;
  readonly timeoutMs = 30_000;
  readonly maxAttempts = 2;

  constructor(private readonly options: ExtractionSkillOptions) {}

  shouldRetry(error: unknown) {
    return isRetryable(error);
  }

  async execute(item: IngestItem) {
    if (item.kind !== "screenshot") throw new Error("Image extraction skill requires a screenshot");
    const candidate = await this.options.provider.extract(item);
    return extractionResult(candidate, this.options.model);
  }
}

function extractionResult(candidate: ExtractionCandidate, model?: string) {
  return {
    value: candidate,
    diagnostics: {
      provider: candidate.provider,
      model,
      promptVersion: "extraction-v1",
      inputUnits: 1,
      outputUnits: 1,
      estimatedCostMicrousd: estimateExtractionCost(candidate.provider),
      fallbackUsed: candidate.fallbackUsed ?? false
    }
  };
}

function estimateExtractionCost(provider: string) {
  if (provider === "vision_llm") return 1_000;
  if (provider === "deepseek_text") return 100;
  return 0;
}

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /429|overloaded|rate limit|timeout|temporarily/i.test(message);
}
