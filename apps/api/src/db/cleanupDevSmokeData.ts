import { createPostgresClient } from "./connection.js";

const databaseUrl = process.env.DATABASE_URL;
const smokeIngestIds = (process.env.SMOKE_INGEST_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for db:cleanup-smoke");
}

if (smokeIngestIds.length === 0) {
  throw new Error("SMOKE_INGEST_IDS is required for db:cleanup-smoke");
}

const sql = createPostgresClient(databaseUrl);
const smokeHoldingIds = smokeIngestIds.map((id) => `HLD-${id}`);
const smokeEventIds = smokeIngestIds.map((id) => `HEV-${id}`);

try {
  await sql.begin(async (transaction) => {
    const holdingQualityEvents = await transaction`
      DELETE FROM "quality_events"
      WHERE "entity_id" = ANY(${smokeHoldingIds})
      RETURNING "id"
    `;
    const smokeHoldingEvents = await transaction`
      DELETE FROM "holding_events"
      WHERE "id" = ANY(${smokeEventIds})
        OR "ingest_item_id" = ANY(${smokeIngestIds})
        OR "holding_id" = ANY(${smokeHoldingIds})
      RETURNING "id"
    `;
    const smokeHoldings = await transaction`
      DELETE FROM "holdings"
      WHERE "id" = ANY(${smokeHoldingIds})
        OR "source_ingest_item_id" = ANY(${smokeIngestIds})
      RETURNING "id"
    `;
    const smokeCandidates = await transaction`
      DELETE FROM "extraction_candidates"
      WHERE "ingest_item_id" = ANY(${smokeIngestIds})
      RETURNING "id"
    `;
    const smokeIngestItems = await transaction`
      DELETE FROM "ingest_items"
      WHERE "id" = ANY(${smokeIngestIds})
      RETURNING "id"
    `;

    console.log(JSON.stringify({
      deleted: {
        qualityEvents: holdingQualityEvents.count,
        holdingEvents: smokeHoldingEvents.count,
        holdings: smokeHoldings.count,
        extractionCandidates: smokeCandidates.count,
        ingestItems: smokeIngestItems.count
      }
    }, null, 2));
  });
} finally {
  await sql.end();
}
