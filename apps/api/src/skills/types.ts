import type { CapabilityName, SkillName } from "@pit/shared";

export interface SkillContext {
  userId: string;
  signal: AbortSignal;
}

export interface SkillDiagnostics {
  provider?: string;
  model?: string;
  promptVersion?: string;
  inputUnits?: number;
  outputUnits?: number;
  estimatedCostMicrousd?: number;
  fallbackUsed?: boolean;
}

export interface SkillResult<T> {
  value: T;
  diagnostics?: SkillDiagnostics;
}

export interface Skill<I, O> {
  name: SkillName;
  version: string;
  capability: CapabilityName;
  timeoutMs: number;
  maxAttempts?: number;
  shouldRetry?(error: unknown): boolean;
  execute(input: I, context: SkillContext): Promise<SkillResult<O>> | SkillResult<O>;
}
