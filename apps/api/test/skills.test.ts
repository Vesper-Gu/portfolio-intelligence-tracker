import assert from "node:assert/strict";
import { test } from "node:test";
import type { IngestItem } from "@pit/shared";
import { buildApp } from "../src/app.js";
import type { ExtractionCandidate } from "../src/extraction/ruleExtractor.js";
import { CapabilityRunner } from "../src/harness/capabilityRunner.js";
import { createMockRepository } from "../src/repository.js";
import { ExtractImageSignalSkill, ExtractTextSignalSkill } from "../src/skills/extractionSkills.js";
import type { Skill } from "../src/skills/types.js";

test("CapabilityRunner records successful skill metadata without sensitive input", async () => {
  const repository = createMockRepository();
  const runner = new CapabilityRunner({ repository });
  const skill: Skill<string, string> = {
    name: "retrieve_evidence",
    version: "test-v1",
    capability: "rag_query",
    timeoutMs: 100,
    execute() {
      return {
        value: "done",
        diagnostics: {
          provider: "test-provider",
          model: "test-model",
          promptVersion: "prompt-v1",
          inputUnits: 4,
          outputUnits: 1,
          estimatedCostMicrousd: 7,
          fallbackUsed: false
        }
      };
    }
  };

  const output = await runner.runSkill({
    userId: "trace-user",
    skill,
    input: "secret",
    inputSummary: "source=storage://private-bucket/user/file.png",
    summarizeOutput: (value) => `result=${value}`
  });
  const exported = await repository.exportAccountData("trace-user");
  const trace = exported.capabilityTraces[0];

  assert.equal(output, "done");
  assert.equal(trace.skillName, "retrieve_evidence");
  assert.equal(trace.skillVersion, "test-v1");
  assert.equal(trace.provider, "test-provider");
  assert.equal(trace.model, "test-model");
  assert.equal(trace.estimatedCostMicrousd, 7);
  assert.equal(trace.attemptCount, 1);
  assert.match(trace.inputSummary ?? "", /storage:\/\/\[redacted\]/);
  assert.doesNotMatch(trace.inputSummary ?? "", /private-bucket|file\.png/);
});

test("CapabilityRunner retries retryable skill errors once", async () => {
  const repository = createMockRepository();
  const runner = new CapabilityRunner({ repository });
  let attempts = 0;
  const skill: Skill<string, string> = {
    name: "generate_grounded_answer",
    version: "test-v1",
    capability: "rag_query",
    timeoutMs: 100,
    maxAttempts: 2,
    shouldRetry: (error) => error instanceof Error && /429/.test(error.message),
    execute() {
      attempts += 1;
      if (attempts === 1) throw new Error("provider 429 overloaded");
      return { value: "retried" };
    }
  };

  assert.equal(await runner.runSkill({ userId: "retry-user", skill, input: "input" }), "retried");
  const trace = (await repository.exportAccountData("retry-user")).capabilityTraces[0];
  assert.equal(trace.status, "success");
  assert.equal(trace.attemptCount, 2);
});

test("CapabilityRunner times out slow skills and records an error trace", async () => {
  const repository = createMockRepository();
  const runner = new CapabilityRunner({ repository });
  const skill: Skill<string, string> = {
    name: "retrieve_evidence",
    version: "test-v1",
    capability: "rag_query",
    timeoutMs: 5,
    execute() {
      return new Promise((resolve) => setTimeout(() => resolve({ value: "late" }), 30));
    }
  };

  await assert.rejects(() => runner.runSkill({ userId: "timeout-user", skill, input: "input" }), /timeout/);
  const trace = (await repository.exportAccountData("timeout-user")).capabilityTraces[0];
  assert.equal(trace.status, "error");
  assert.equal(trace.errorCode, "provider_retryable");
});

test("text and image extraction providers are wrapped as separate skills", async () => {
  const fallbackCandidate: ExtractionCandidate = {
    provider: "rule_v1",
    ticker: "NET",
    action: "观察",
    confidence: "0.50",
    summary: "fallback",
    status: "fallback",
    fallbackUsed: true,
    retryable: true
  };
  const provider = { extract: () => fallbackCandidate };
  const textSkill = new ExtractTextSignalSkill({ provider, model: "text-model" });
  const imageSkill = new ExtractImageSignalSkill({ provider, model: "vision-model" });
  const textItem = ingestItem({ kind: "text" });
  const imageItem = ingestItem({ kind: "screenshot", storageObjectKey: "ingest/user/image.png" });

  const text = await textSkill.execute(textItem);
  const image = await imageSkill.execute(imageItem);

  assert.equal(text.value[0]?.provider, "rule_v1");
  assert.equal(text.diagnostics?.fallbackUsed, true);
  assert.equal(text.diagnostics?.model, "text-model");
  assert.equal(image.diagnostics?.model, "vision-model");
  await assert.rejects(() => imageSkill.execute(textItem), /requires a screenshot/);
});

test("RAG retrieval skills do not expose another authenticated user's evidence", async () => {
  const repository = createMockRepository();
  const app = buildApp({
    repository,
    authMode: "external",
    authVerifier: async (authorization) => {
      if (authorization === "Bearer token-a") return "user-a";
      if (authorization === "Bearer token-b") return "user-b";
      throw new Error("unauthorized");
    }
  });
  const userA = { authorization: "Bearer token-a" };
  const userB = { authorization: "Bearer token-b" };

  await app.inject({
    method: "POST",
    url: "/ingest-items",
    headers: userA,
    payload: { source: "private note", kind: "text", rawText: "NET private research", ticker: "NET" }
  });
  await app.inject({ method: "POST", url: "/ingest-items/ING-2000/extract", headers: userA });
  await app.inject({ method: "POST", url: "/ingest-items/ING-2000/accept", headers: userA });

  const response = await app.inject({
    method: "POST",
    url: "/rag/query",
    headers: userB,
    payload: { query: "NET 有哪些证据？" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().citations.length, 0);
  assert.doesNotMatch(response.json().answer, /private research/);
});

function ingestItem(patch: Partial<IngestItem>): IngestItem {
  return {
    id: "ING-TEST",
    source: "test",
    kind: "text",
    ticker: "NET",
    confidence: "0.50",
    status: "待复核",
    rawText: "NET test note",
    ...patch
  };
}
