import type {
  ExtractionCandidate,
  HoldingEvent,
  HoldingRecord,
  IngestItem,
  PortfolioPosition
} from "@pit/shared";
import type { PortfolioRepository } from "../repositories/portfolioRepository.js";

export type RagIntent = "position_summary" | "evidence" | "risk" | "recent_changes" | "source_trace" | "overview";

export interface RagRetrievalRequest {
  userId: string;
  query: string;
  intent: RagIntent;
  tickers: string[];
  limit: number;
}

export interface RagRetrievalSnapshot {
  positions: PortfolioPosition[];
  holdings: HoldingRecord[];
  events: HoldingEvent[];
  ingestItems: IngestItem[];
  candidates: ExtractionCandidate[];
}

export interface RagRetrievalRepository {
  retrieveSnapshot(request: RagRetrievalRequest): Promise<RagRetrievalSnapshot>;
}

export interface RagVectorDocument {
  id: string;
  entityType: string;
  entityId: string;
  sourceIngestItemId?: string;
  ticker?: string;
  title: string;
  text: string;
}

export interface RagVectorMatch {
  documentId: string;
  score: number;
}

export interface RagVectorRetriever {
  search(userId: string, query: string, documents: RagVectorDocument[], limit: number): Promise<RagVectorMatch[]>;
}

export function createPortfolioRagRetrievalRepository(repository: PortfolioRepository): RagRetrievalRepository {
  return {
    async retrieveSnapshot(request) {
      if (repository.getRagRetrievalSnapshot) {
        return repository.getRagRetrievalSnapshot(request);
      }

      const [positions, holdings, events, ingestItems] = await Promise.all([
        repository.getPortfolioPositions(request.userId),
        repository.getHoldings(request.userId),
        repository.getHoldingEvents(request.userId),
        repository.getIngestItems(request.userId)
      ]);
      const ingestItemIds = ingestItems.map((item) => item.id);
      const candidates = repository.getExtractionCandidatesByIngestItemIds
        ? await repository.getExtractionCandidatesByIngestItemIds(request.userId, ingestItemIds)
        : (await Promise.all(ingestItemIds.map((id) => repository.getExtractionCandidates(request.userId, id)))).flat();

      return filterSnapshot({ positions, holdings, events, ingestItems, candidates }, request.tickers);
    }
  };
}

function filterSnapshot(snapshot: RagRetrievalSnapshot, tickers: string[]) {
  if (!tickers.length) return snapshot;

  const tickerSet = new Set(tickers);
  const holdings = snapshot.holdings.filter((holding) => tickerSet.has(holding.ticker.toUpperCase()));
  const events = snapshot.events.filter((event) => tickerSet.has(event.ticker.toUpperCase()));
  const ingestIds = new Set([
    ...holdings.map((holding) => holding.sourceIngestItemId),
    ...events.map((event) => event.ingestItemId)
  ]);
  const ingestItems = snapshot.ingestItems.filter((item) => tickerSet.has(item.ticker.toUpperCase()) || ingestIds.has(item.id));
  const scopedIngestIds = new Set(ingestItems.map((item) => item.id));
  const candidates = snapshot.candidates.filter((candidate) => (
    tickerSet.has(candidate.ticker.toUpperCase()) || scopedIngestIds.has(candidate.ingestItemId)
  ));
  const positions = snapshot.positions.filter((position) => tickerSet.has(position.ticker.toUpperCase()));

  return { positions, holdings, events, ingestItems, candidates };
}
