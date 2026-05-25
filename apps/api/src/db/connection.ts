import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

export function createPostgresClient(databaseUrl: string) {
  return postgres(normalizeDatabaseUrl(databaseUrl), {
    max: 1,
    prepare: false
  });
}

export function createDatabase(databaseUrl: string, client?: Sql) {
  return drizzle(client ?? createPostgresClient(databaseUrl));
}

function normalizeDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);

  try {
    decodeURIComponent(url.password);
  } catch {
    url.password = encodeURIComponent(url.password);
  }

  return url.toString();
}
