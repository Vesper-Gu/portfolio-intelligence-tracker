import type { RagAnswerInput, RagAnswerGenerator } from "./llm.js";
import { buildApp } from "../app.js";

interface ExpectedRagBehavior {
  answerMode?: "llm" | "template";
  minCitations?: number;
  maxCitations?: number;
  answerIncludes?: RegExp[];
  answerExcludes?: RegExp[];
  citationTitleIncludes?: RegExp;
  generatorCalled?: boolean;
}

interface RagEvaluationCase {
  id: string;
  question: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  generator?: RagAnswerGenerator;
  expected: ExpectedRagBehavior;
}

export interface RagEvaluationResult {
  id: string;
  question: string;
  passed: boolean;
  failures: string[];
  answerMode?: string;
  citationCount: number;
  durationMs: number;
}

export interface RagEvaluationSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  averageDurationMs: number;
  results: RagEvaluationResult[];
}

export async function runRagEvaluation(): Promise<RagEvaluationSummary> {
  const results: RagEvaluationResult[] = [];

  for (const evaluationCase of evaluationCases()) {
    results.push(await runCase(evaluationCase));
  }

  const passed = results.filter((result) => result.passed).length;
  const averageDurationMs = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.durationMs, 0) / results.length)
    : 0;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Number((passed / results.length).toFixed(3)) : 0,
    averageDurationMs,
    results
  };
}

function evaluationCases(): RagEvaluationCase[] {
  return [
    {
      id: "position-summary",
      question: "NVDA 当前仓位信号是什么？",
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerIncludes: [/NVDA/, /加仓/],
        citationTitleIncludes: /NVDA/
      }
    },
    {
      id: "evidence",
      question: "NVDA 有哪些证据？",
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerIncludes: [/找到以下证据/, /NVDA/],
        citationTitleIncludes: /NVDA/
      }
    },
    {
      id: "follow-up-evidence",
      question: "有哪些证据？",
      conversationHistory: [
        { role: "user", content: "先看 NVDA" },
        { role: "assistant", content: "NVDA 当前已有一条资料库记录。" }
      ],
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerIncludes: [/证据|NVDA/],
        citationTitleIncludes: /NVDA/
      }
    },
    {
      id: "risk",
      question: "当前有什么风险？",
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerIncludes: [/MSTR|风险|复核/]
      }
    },
    {
      id: "source-trace",
      question: "NET 的来源截图是什么？",
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerIncludes: [/截图上传|来源追溯|NET/],
        answerExcludes: [/storage:\/\//, /private-bucket/, /Storage object/]
      }
    },
    {
      id: "missing-ticker",
      question: "ZZZZ 有哪些证据？",
      generator: generator(() => "should not be used"),
      expected: {
        answerMode: "template",
        maxCitations: 0,
        answerIncludes: [/没有找到 ZZZZ/],
        generatorCalled: false
      }
    },
    {
      id: "llm-valid",
      question: "NVDA 有哪些证据？",
      generator: generator(() => "NVDA 来自 @Investor_X，动作是加仓。"),
      expected: {
        answerMode: "llm",
        minCitations: 1,
        answerIncludes: [/NVDA/, /@Investor_X/, /加仓/],
        generatorCalled: true
      }
    },
    {
      id: "llm-unsupported-ticker",
      question: "NVDA 有哪些证据？",
      generator: generator(() => "NVDA 已有资料，同时 TSLA 也值得关注。"),
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerExcludes: [/TSLA/],
        generatorCalled: true
      }
    },
    {
      id: "llm-unsupported-facts",
      question: "NVDA 有哪些证据？",
      generator: generator(() => "NVDA 在 2030-01-01 来自 Rumor Desk，动作是减仓。"),
      expected: {
        answerMode: "template",
        minCitations: 1,
        answerExcludes: [/2030-01-01/, /Rumor Desk/, /减仓/],
        generatorCalled: true
      }
    }
  ];
}

async function runCase(evaluationCase: RagEvaluationCase): Promise<RagEvaluationResult> {
  const startedAt = Date.now();
  const failures: string[] = [];
  const generatorState = { called: false };
  const app = buildApp({
    ragAnswerGenerator: evaluationCase.generator
      ? {
        async generate(input) {
          generatorState.called = true;
          return evaluationCase.generator?.generate(input) ?? "";
        }
      }
      : undefined
  });
  await seedEvaluationData(app);
  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    payload: {
      query: evaluationCase.question,
      conversationHistory: evaluationCase.conversationHistory
    }
  });
  const body = response.json() as {
    answer?: string;
    answerMode?: string;
    citations?: Array<{ title: string }>;
  };
  const answer = body.answer ?? "";
  const citations = body.citations ?? [];

  if (response.statusCode !== 200) failures.push(`status=${response.statusCode}`);
  if (evaluationCase.expected.answerMode && body.answerMode !== evaluationCase.expected.answerMode) {
    failures.push(`answerMode expected ${evaluationCase.expected.answerMode}, got ${body.answerMode}`);
  }
  if (evaluationCase.expected.minCitations !== undefined && citations.length < evaluationCase.expected.minCitations) {
    failures.push(`citations expected >=${evaluationCase.expected.minCitations}, got ${citations.length}`);
  }
  if (evaluationCase.expected.maxCitations !== undefined && citations.length > evaluationCase.expected.maxCitations) {
    failures.push(`citations expected <=${evaluationCase.expected.maxCitations}, got ${citations.length}`);
  }
  for (const pattern of evaluationCase.expected.answerIncludes ?? []) {
    if (!pattern.test(answer)) failures.push(`answer missing ${pattern}`);
  }
  for (const pattern of evaluationCase.expected.answerExcludes ?? []) {
    if (pattern.test(answer)) failures.push(`answer unexpectedly matched ${pattern}`);
  }
  if (
    evaluationCase.expected.citationTitleIncludes
    && !citations.some((citation) => evaluationCase.expected.citationTitleIncludes?.test(citation.title))
  ) {
    failures.push(`citations missing title ${evaluationCase.expected.citationTitleIncludes}`);
  }
  if (
    evaluationCase.expected.generatorCalled !== undefined
    && generatorState.called !== evaluationCase.expected.generatorCalled
  ) {
    failures.push(`generatorCalled expected ${evaluationCase.expected.generatorCalled}, got ${generatorState.called}`);
  }

  return {
    id: evaluationCase.id,
    question: evaluationCase.question,
    passed: failures.length === 0,
    failures,
    answerMode: body.answerMode,
    citationCount: citations.length,
    durationMs: Date.now() - startedAt
  };
}

async function seedEvaluationData(app: ReturnType<typeof buildApp>) {
  for (const id of ["ING-1024", "ING-1025", "ING-1026"]) {
    await app.inject({ method: "POST", url: `/ingest-items/${id}/extract` });
    await app.inject({
      method: "POST",
      url: `/ingest-items/${id}/accept`,
      payload: { reviewer: "rag-eval" }
    });
  }

  await app.inject({
    method: "POST",
    url: "/ingest-items",
    payload: {
      source: "storage://private-bucket/user-1/net-shot.png",
      kind: "text",
      rawText: "Image uploaded: net-shot.png\nStorage object: storage://private-bucket/user-1/net-shot.png\nNET screenshot note",
      ticker: "NET"
    }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-2000/extract" });
  await app.inject({
    method: "POST",
    url: "/ingest-items/ING-2000/accept",
    payload: { reviewer: "rag-eval" }
  });
}

function generator(run: (input: RagAnswerInput) => string): RagAnswerGenerator {
  return {
    async generate(input) {
      return run(input);
    }
  };
}
