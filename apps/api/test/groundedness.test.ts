import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGroundedAnswer } from "../src/rag/groundedness.js";

const citations = [{
  id: "RAG-HLD-HLD-NVDA",
  entityType: "holding" as const,
  entityId: "HLD-NVDA",
  sourceIngestItemId: "ING-1024",
  title: "Holding NVDA",
  snippet: "ticker=NVDA action=加仓 source=@Investor_X publishedAt=2026-05-12",
  score: 10
}];
const contextSummary = [
  "- NVDA: 动作=加仓; 来源=@Investor_X; 资料日期=2026-05-12; 更新时间=06/01 10:00",
  "- ING-1024: ticker=NVDA; 来源=@Investor_X; 原文摘要=Added to NVDA again"
].join("\n");

test("groundedness accepts cited ticker action time and source", () => {
  assert.deepEqual(
    validateGroundedAnswer({
      answer: "NVDA 的资料来自 @Investor_X，动作是加仓，资料日期为 2026-05-12。",
      contextSummary,
      citations
    }),
    { grounded: true }
  );
});

test("groundedness rejects LLM answers without cited ticker", () => {
  const result = validateGroundedAnswer({
    answer: "这条记录来自 @Investor_X，动作是加仓。",
    contextSummary,
    citations
  });

  assert.equal(result.grounded, false);
  assert.equal(result.reason, "missing_evidence_ticker");
});

test("groundedness rejects unsupported action time and source", () => {
  const result = validateGroundedAnswer({
    answer: "NVDA 在 2030-01-01 来自 Rumor Desk，动作是减仓。",
    contextSummary,
    citations
  });

  assert.equal(result.grounded, false);
  assert.match(result.reason ?? "", /unsupported_/);
});
