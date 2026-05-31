import assert from "node:assert/strict";
import { test } from "node:test";
import type { HoldingRecord, IngestItem } from "@pit/shared";
import type { PortfolioRepository } from "../src/repositories/portfolioRepository.js";
import { retrieveRagEvidenceFromRepository } from "../src/rag/query.js";
import {
  createPortfolioRagRetrievalRepository,
  type RagRetrievalRepository,
  type RagVectorRetriever
} from "../src/rag/retrieval.js";

test("portfolio retrieval adapter batches candidate loading and filters requested tickers", async () => {
  let batchCalls = 0;
  const repository = {
    getPortfolioPositions: () => [],
    getHoldings: () => [holding("NET"), holding("SMH")],
    getHoldingEvents: () => [],
    getIngestItems: () => [ingestItem("NET"), ingestItem("SMH")],
    getExtractionCandidates: () => {
      throw new Error("per-item candidate query must not run");
    },
    getExtractionCandidatesByIngestItemIds: (_userId: string, ids: string[]) => {
      batchCalls += 1;
      assert.deepEqual(ids, ["ING-NET", "ING-SMH"]);
      return [];
    }
  } as unknown as PortfolioRepository;
  const retrieval = createPortfolioRagRetrievalRepository(repository);
  const snapshot = await retrieval.retrieveSnapshot({
    userId: "user-a",
    query: "NET 有哪些证据？",
    intent: "evidence",
    tickers: ["NET"],
    limit: 6
  });

  assert.equal(batchCalls, 1);
  assert.deepEqual(snapshot.holdings.map((item) => item.ticker), ["NET"]);
  assert.deepEqual(snapshot.ingestItems.map((item) => item.ticker), ["NET"]);
});

test("RAG retrieval combines vector matches after structured filtering", async () => {
  let requestedTickers: string[] = [];
  const retrieval: RagRetrievalRepository = {
    async retrieveSnapshot(request) {
      requestedTickers = request.tickers;
      return {
        positions: [],
        holdings: [holding("NET")],
        events: [],
        ingestItems: [ingestItem("NET")],
        candidates: []
      };
    }
  };
  const vectorRetriever: RagVectorRetriever = {
    async search(_userId, _query, documents) {
      assert.ok(documents.every((document) => document.ticker === "NET"));
      return [{ documentId: "RAG-HLD-HLD-NET", score: 0.9 }];
    }
  };
  const result = await retrieveRagEvidenceFromRepository(
    retrieval,
    "user-a",
    "NET 有哪些证据？",
    6,
    [],
    vectorRetriever
  );

  assert.deepEqual(requestedTickers, ["NET"]);
  assert.equal(result.retrievalMode, "hybrid");
  assert.ok(result.citations.some((citation) => citation.id === "RAG-HLD-HLD-NET"));
});

test("RAG retrieval falls back to keyword mode when vector search fails", async () => {
  const retrieval: RagRetrievalRepository = {
    async retrieveSnapshot() {
      return {
        positions: [],
        holdings: [holding("NET")],
        events: [],
        ingestItems: [ingestItem("NET")],
        candidates: []
      };
    }
  };
  const vectorRetriever: RagVectorRetriever = {
    async search() {
      throw new Error("embedding provider unavailable");
    }
  };
  const result = await retrieveRagEvidenceFromRepository(
    retrieval,
    "user-a",
    "NET 有哪些证据？",
    6,
    [],
    vectorRetriever
  );

  assert.equal(result.retrievalMode, "keyword");
  assert.ok(result.citations.length > 0);
});

function holding(ticker: string): HoldingRecord {
  return {
    id: `HLD-${ticker}`,
    ticker,
    source: "private note",
    sourceIngestItemId: `ING-${ticker}`,
    lastAction: "观察",
    confidence: "0.50",
    status: "已确认",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  };
}

function ingestItem(ticker: string): IngestItem {
  return {
    id: `ING-${ticker}`,
    source: "private note",
    kind: "text",
    ticker,
    confidence: "0.50",
    status: "已接受",
    rawText: `${ticker} research evidence`
  };
}
