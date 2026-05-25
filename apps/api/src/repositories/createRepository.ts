import { createDatabaseRepository } from "./databasePortfolioRepository.js";
import { createMockRepository } from "./mockPortfolioRepository.js";
import type { PortfolioRepository } from "./portfolioRepository.js";

export type RepositoryMode = "mock" | "database";

export interface RepositoryConfig {
  mode: RepositoryMode;
  databaseUrl?: string;
}

export function createRepository(config: RepositoryConfig): PortfolioRepository {
  if (config.mode === "database") {
    if (!config.databaseUrl) {
      throw new Error("DATA_REPOSITORY=database requires DATABASE_URL");
    }

    return createDatabaseRepository({ databaseUrl: config.databaseUrl });
  }

  return createMockRepository();
}
