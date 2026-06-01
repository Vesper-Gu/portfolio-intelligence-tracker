import assert from "node:assert/strict";
import { test } from "node:test";
import { runRagEvaluation } from "../src/rag/evaluation.js";

test("RAG evaluation baseline passes fixed retrieval and groundedness cases", async () => {
  const summary = await runRagEvaluation();

  assert.equal(summary.total, 9);
  assert.equal(summary.failed, 0, JSON.stringify(summary.results.filter((result) => !result.passed), null, 2));
  assert.equal(summary.passRate, 1);
  assert.ok(summary.averageDurationMs >= 0);
});
