import { runRagEvaluation } from "./evaluation.js";

const summary = await runRagEvaluation();

console.log(JSON.stringify({
  total: summary.total,
  passed: summary.passed,
  failed: summary.failed,
  passRate: summary.passRate,
  averageDurationMs: summary.averageDurationMs,
  results: summary.results.map((result) => ({
    id: result.id,
    passed: result.passed,
    answerMode: result.answerMode,
    citations: result.citationCount,
    durationMs: result.durationMs,
    failures: result.failures
  }))
}, null, 2));

if (summary.failed > 0) {
  process.exitCode = 1;
}
