import { ingestItems, sources } from "@pit/shared";
import { createDatabase, createPostgresClient } from "./connection.js";
import { ingestItemsTable, sourcesTable } from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
const seedUserId = process.env.SEED_USER_ID ?? "local-dev-user";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for db:seed");
}

const client = createPostgresClient(databaseUrl);
const db = createDatabase(databaseUrl, client);

await db
  .insert(sourcesTable)
  .values(sources.map((source) => ({ ...source, userId: seedUserId })))
  .onConflictDoUpdate({
    target: [sourcesTable.userId, sourcesTable.name],
    set: {
      platform: sourcesTable.platform,
      type: sourcesTable.type,
      status: sourcesTable.status,
      lastSync: sourcesTable.lastSync,
      records: sourcesTable.records,
      parser: sourcesTable.parser,
      tags: sourcesTable.tags,
      updatedAt: new Date()
    }
  });

await db
  .insert(ingestItemsTable)
  .values(ingestItems.map((item) => ({ ...item, userId: seedUserId })))
  .onConflictDoUpdate({
    target: ingestItemsTable.id,
    set: {
      source: ingestItemsTable.source,
      kind: ingestItemsTable.kind,
      ticker: ingestItemsTable.ticker,
      confidence: ingestItemsTable.confidence,
      status: ingestItemsTable.status,
      rawText: ingestItemsTable.rawText,
      updatedAt: new Date()
    }
  });

console.log(`Seeded ${sources.length} sources and ${ingestItems.length} ingest items.`);

await client.end();
