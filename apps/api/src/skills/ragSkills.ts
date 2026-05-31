import type { RagQueryRequest, RagQueryResponse } from "@pit/shared";
import type { PortfolioRepository } from "../repositories/portfolioRepository.js";
import { validateGroundedAnswer, type GroundednessResult } from "../rag/groundedness.js";
import type { RagAnswerGenerator } from "../rag/llm.js";
import { retrieveRagEvidence, type RagEvidenceBundle } from "../rag/query.js";
import type { CapabilityRunner } from "../harness/capabilityRunner.js";
import type { SkillRegistry } from "./registry.js";
import type { Skill, SkillResult } from "./types.js";

interface RetrieveEvidenceInput {
  query: string;
  limit?: number;
  conversationHistory?: RagQueryRequest["conversationHistory"];
}

interface GenerateAnswerOutput {
  answer: string;
  mode: "llm" | "template";
}

interface ValidateGroundingInput {
  evidence: RagEvidenceBundle;
  generated: GenerateAnswerOutput;
}

export class RetrieveEvidenceSkill implements Skill<RetrieveEvidenceInput, RagEvidenceBundle> {
  readonly name = "retrieve_evidence" as const;
  readonly version = "1.0.0";
  readonly capability = "rag_query" as const;
  readonly timeoutMs = 10_000;

  constructor(private readonly repository: PortfolioRepository) {}

  async execute(input: RetrieveEvidenceInput, context: { userId: string }) {
    const value = await retrieveRagEvidence(
      this.repository,
      context.userId,
      input.query,
      input.limit,
      input.conversationHistory
    );
    return {
      value,
      diagnostics: {
        provider: "repository_keyword_retrieval",
        model: "deterministic-v1",
        inputUnits: input.query.length,
        outputUnits: value.citations.length,
        estimatedCostMicrousd: 0
      }
    };
  }
}

export class GenerateGroundedAnswerSkill implements Skill<RagEvidenceBundle, GenerateAnswerOutput> {
  readonly name = "generate_grounded_answer" as const;
  readonly version = "1.0.0";
  readonly capability = "rag_query" as const;
  readonly timeoutMs = 15_000;
  readonly maxAttempts = 2;

  constructor(
    private readonly answerGenerator?: RagAnswerGenerator,
    private readonly model = "template"
  ) {}

  shouldRetry(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    return /429|overloaded|rate limit|timeout|temporarily/i.test(message);
  }

  async execute(input: RagEvidenceBundle): Promise<SkillResult<GenerateAnswerOutput>> {
    if (!this.answerGenerator || !input.citations.length) {
      return {
        value: { answer: input.deterministicAnswer, mode: "template" as const },
        diagnostics: {
          provider: "deterministic_template",
          model: "template-v1",
          promptVersion: "rag-answer-v1",
          inputUnits: input.contextSummary.length,
          outputUnits: input.deterministicAnswer.length,
          estimatedCostMicrousd: 0,
          fallbackUsed: false
        }
      };
    }

    const answer = await this.answerGenerator.generate(input);
    return {
      value: { answer, mode: "llm" as const },
      diagnostics: {
        provider: "openai_compatible",
        model: this.model,
        promptVersion: "rag-answer-v1",
        inputUnits: input.contextSummary.length,
        outputUnits: answer.length,
        estimatedCostMicrousd: estimateLlmCost(input.contextSummary.length, answer.length),
        fallbackUsed: false
      }
    };
  }
}

export class ValidateGroundingSkill implements Skill<ValidateGroundingInput, GroundednessResult> {
  readonly name = "validate_grounding" as const;
  readonly version = "1.0.0";
  readonly capability = "rag_query" as const;
  readonly timeoutMs = 2_000;

  execute(input: ValidateGroundingInput) {
    const value = input.generated.mode === "template"
      ? { grounded: true }
      : validateGroundedAnswer({
        answer: input.generated.answer,
        contextSummary: input.evidence.contextSummary,
        citations: input.evidence.citations
      });

    return {
      value,
      diagnostics: {
        provider: "deterministic_groundedness",
        model: "rules-v1",
        inputUnits: input.generated.answer.length,
        outputUnits: 1,
        estimatedCostMicrousd: 0,
        fallbackUsed: input.generated.mode === "template"
      }
    };
  }
}

export async function answerRagQueryWithSkills(
  runner: CapabilityRunner,
  registry: SkillRegistry,
  userId: string,
  input: RetrieveEvidenceInput,
  limit: number
): Promise<RagQueryResponse> {
  const evidence = await runner.runSkill({
    userId,
    skill: registry.get<RetrieveEvidenceInput, RagEvidenceBundle>("retrieve_evidence"),
    input,
    limit,
    inputSummary: `queryLength=${input.query.length}; historyTurns=${input.conversationHistory?.length ?? 0}`,
    summarizeOutput: (result) => `intent=${result.intent}; citations=${result.citations.length}`
  });
  let generated: GenerateAnswerOutput;
  try {
    generated = await runner.runSkill({
      userId,
      skill: registry.get<RagEvidenceBundle, GenerateAnswerOutput>("generate_grounded_answer"),
      input: evidence,
      consumeUsage: false,
      inputSummary: `intent=${evidence.intent}; citations=${evidence.citations.length}`,
      summarizeOutput: (result) => `mode=${result.mode}; answerLength=${result.answer.length}`
    });
  } catch {
    generated = {
      answer: evidence.deterministicAnswer,
      mode: "template"
    };
  }
  const validation = await runner.runSkill({
    userId,
    skill: registry.get<ValidateGroundingInput, GroundednessResult>("validate_grounding"),
    input: { evidence, generated },
    consumeUsage: false,
    inputSummary: `mode=${generated.mode}; citations=${evidence.citations.length}`,
    summarizeOutput: (result) => `grounded=${result.grounded}; reason=${result.reason ?? "none"}`
  });

  return {
    query: input.query,
    answer: validation.grounded ? generated.answer : evidence.deterministicAnswer,
    answerMode: validation.grounded ? generated.mode : "template",
    citations: evidence.citations,
    generatedAt: new Date().toISOString()
  };
}

function estimateLlmCost(inputCharacters: number, outputCharacters: number) {
  return Math.ceil(inputCharacters / 4) + Math.ceil(outputCharacters / 4);
}
