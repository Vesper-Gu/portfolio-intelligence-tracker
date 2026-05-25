import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { routeRequest } from "./http/router.js";
import { MemoryRepository } from "./repositories/memoryRepository.js";
import { seedData } from "./repositories/seedData.js";
import { PortfolioService } from "./services/portfolioService.js";

export function createApp() {
  const repository = new MemoryRepository(seedData);
  const service = new PortfolioService(repository);
  return createServer((req, res) => routeRequest(req, res, service));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 4317);
  const server = createApp();
  server.listen(port, () => {
    process.stdout.write(`PIT backend listening on http://localhost:${port}\n`);
  });
}
