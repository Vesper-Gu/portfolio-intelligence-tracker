import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresClient } from "./connection.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for db:migrate");
}

const migrationsDir = fileURLToPath(new URL("../../drizzle", import.meta.url));
const migrationFiles = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error("No SQL migration files found");
}

const sql = createPostgresClient(databaseUrl);

try {
  await sql`CREATE TABLE IF NOT EXISTS "__pit_migrations" (
    "name" text PRIMARY KEY,
    "applied_at" timestamp with time zone DEFAULT now() NOT NULL
  )`;

  for (const file of migrationFiles) {
    const [existing] = await sql<{ name: string }[]>`SELECT "name" FROM "__pit_migrations" WHERE "name" = ${file}`;

    if (existing) {
      console.log(`Skipping ${file}`);
      continue;
    }

    const migrationSql = await readFile(join(migrationsDir, file), "utf8");

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);
      await transaction`INSERT INTO "__pit_migrations" ("name") VALUES (${file})`;
    });

    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
