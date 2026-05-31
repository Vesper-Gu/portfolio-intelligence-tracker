import type { CapabilityName, CapabilityTrace } from "@pit/shared";
import type { PortfolioRepository } from "../repositories/portfolioRepository.js";

interface CapabilityRunnerOptions {
  repository: PortfolioRepository;
  log?: {
    info(payload: object, message: string): void;
    warn(payload: object, message: string): void;
  };
}

interface RunCapabilityOptions<T> {
  userId: string;
  capability: CapabilityName;
  limit?: number;
  inputSummary?: string;
  summarizeOutput?: (output: T) => string;
  run: () => Promise<T> | T;
}

export class CapabilityLimitError extends Error {
  constructor(readonly capability: CapabilityName) {
    super(`Daily ${capability} limit reached`);
  }
}

export class CapabilityRunner {
  constructor(private readonly options: CapabilityRunnerOptions) {}

  async getDailyUsage(userId: string) {
    return this.options.repository.getDailyCapabilityUsage(userId);
  }

  async run<T>(input: RunCapabilityOptions<T>): Promise<T> {
    const startedAt = Date.now();
    if (input.limit === 0) throw new CapabilityLimitError(input.capability);

    const usage = await this.options.repository.incrementDailyCapabilityUsage(input.userId, input.capability, input.limit);
    if (!usage) throw new CapabilityLimitError(input.capability);

    try {
      const output = await input.run();
      const trace = await this.saveTrace(input, {
        capability: input.capability,
        status: "success",
        durationMs: Date.now() - startedAt,
        inputSummary: sanitizeSummary(input.inputSummary),
        outputSummary: sanitizeSummary(input.summarizeOutput?.(output))
      });
      this.options.log?.info({ event: "capability_completed", traceId: trace.id, capability: trace.capability, durationMs: trace.durationMs }, "Capability completed");
      return output;
    } catch (error) {
      const trace = await this.saveTrace(input, {
        capability: input.capability,
        status: "error",
        durationMs: Date.now() - startedAt,
        inputSummary: sanitizeSummary(input.inputSummary),
        errorCode: errorCode(error)
      });
      this.options.log?.warn({ event: "capability_failed", traceId: trace.id, capability: trace.capability, durationMs: trace.durationMs, errorCode: trace.errorCode }, "Capability failed");
      throw error;
    }
  }

  private saveTrace<T>(input: RunCapabilityOptions<T>, trace: Omit<CapabilityTrace, "id" | "createdAt">) {
    return this.options.repository.createCapabilityTrace(input.userId, trace);
  }
}

function sanitizeSummary(value?: string) {
  if (!value) return undefined;

  return value
    .replace(/storage:\/\/\S+/gi, "storage://[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function errorCode(error: unknown) {
  if (error instanceof CapabilityLimitError) return "daily_limit_reached";
  const message = error instanceof Error ? error.message : "";

  if (/429|overloaded|rate limit|timeout|temporarily/i.test(message)) return "provider_retryable";
  if (/401|403|authentication|unauthorized|forbidden/i.test(message)) return "provider_auth_failed";
  if (/grounded/i.test(message)) return "groundedness_validation_failed";
  return "capability_failed";
}
