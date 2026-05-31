import type { CapabilityName, CapabilityTrace } from "@pit/shared";
import type { PortfolioRepository } from "../repositories/portfolioRepository.js";
import type { Skill, SkillDiagnostics } from "../skills/types.js";

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

interface RunSkillOptions<I, O> {
  userId: string;
  skill: Skill<I, O>;
  input: I;
  limit?: number;
  consumeUsage?: boolean;
  inputSummary?: string;
  summarizeOutput?: (output: O) => string;
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

  async runSkill<I, O>(input: RunSkillOptions<I, O>): Promise<O> {
    const startedAt = Date.now();
    if (input.limit === 0) throw new CapabilityLimitError(input.skill.capability);

    if (input.consumeUsage !== false) {
      const usage = await this.options.repository.incrementDailyCapabilityUsage(input.userId, input.skill.capability, input.limit);
      if (!usage) throw new CapabilityLimitError(input.skill.capability);
    }

    let attemptCount = 0;
    try {
      while (true) {
        attemptCount += 1;
        const controller = new AbortController();
        try {
          const result = await withTimeout(
            Promise.resolve(input.skill.execute(input.input, { userId: input.userId, signal: controller.signal })),
            input.skill.timeoutMs,
            controller
          );
          const trace = await this.saveSkillTrace(input, startedAt, attemptCount, result.diagnostics, {
            status: "success",
            outputSummary: sanitizeSummary(input.summarizeOutput?.(result.value))
          });
          this.options.log?.info({ event: "skill_completed", traceId: trace.id, skillName: trace.skillName, durationMs: trace.durationMs }, "Skill completed");
          return result.value;
        } catch (error) {
          if (attemptCount < (input.skill.maxAttempts ?? 1) && input.skill.shouldRetry?.(error)) continue;
          throw error;
        }
      }
    } catch (error) {
      const trace = await this.saveSkillTrace(input, startedAt, attemptCount, undefined, {
        status: "error",
        errorCode: errorCode(error)
      });
      this.options.log?.warn({ event: "skill_failed", traceId: trace.id, skillName: trace.skillName, durationMs: trace.durationMs, errorCode: trace.errorCode }, "Skill failed");
      throw error;
    }
  }

  private saveTrace<T>(input: RunCapabilityOptions<T>, trace: Omit<CapabilityTrace, "id" | "createdAt">) {
    return this.options.repository.createCapabilityTrace(input.userId, trace);
  }

  private saveSkillTrace<I, O>(
    input: RunSkillOptions<I, O>,
    startedAt: number,
    attemptCount: number,
    diagnostics: SkillDiagnostics | undefined,
    result: Pick<CapabilityTrace, "status" | "outputSummary" | "errorCode">
  ) {
    return this.options.repository.createCapabilityTrace(input.userId, {
      capability: input.skill.capability,
      status: result.status,
      durationMs: Date.now() - startedAt,
      skillName: input.skill.name,
      skillVersion: input.skill.version,
      provider: diagnostics?.provider,
      model: diagnostics?.model,
      promptVersion: diagnostics?.promptVersion,
      attemptCount,
      inputUnits: diagnostics?.inputUnits,
      outputUnits: diagnostics?.outputUnits,
      estimatedCostMicrousd: diagnostics?.estimatedCostMicrousd,
      fallbackUsed: diagnostics?.fallbackUsed,
      inputSummary: sanitizeSummary(input.inputSummary),
      outputSummary: result.outputSummary,
      errorCode: result.errorCode
    });
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`Skill timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
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
