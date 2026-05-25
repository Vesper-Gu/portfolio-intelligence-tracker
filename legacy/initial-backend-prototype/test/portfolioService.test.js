import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import { seedData } from "../src/repositories/seedData.js";
import { PortfolioService } from "../src/services/portfolioService.js";

test("consensus matrix ranks NVDA first from seeded holdings", () => {
  const service = new PortfolioService(new MemoryRepository(seedData));
  const matrix = service.consensusMatrix();

  assert.equal(matrix[0].ticker, "NVDA");
  assert.equal(matrix[0].kolCount, 2);
  assert.equal(matrix[0].addCount, 2);
});

test("createHolding normalizes ticker and validates weight", () => {
  const service = new PortfolioService(new MemoryRepository(seedData));
  const holding = service.createHolding({
    kolId: "kol-investor-x",
    ticker: "$msft",
    assetType: "stock",
    action: "hold",
    weightPct: "16.125"
  });

  assert.equal(holding.ticker, "MSFT");
  assert.equal(holding.weightPct, 16.13);
});

test("quality summary exposes review and verification metrics", () => {
  const service = new PortfolioService(new MemoryRepository(seedData));
  const summary = service.qualitySummary();

  assert.equal(summary.totalHoldings, 4);
  assert.equal(summary.pendingReviewCount, 1);
  assert.ok(summary.verifiedRate > 0);
});

