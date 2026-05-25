import { buildApp } from "./app.js";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthConfiguration } from "./auth.js";
import { loadLocalEnv } from "./env.js";
import { createExtractionProviderFromEnv } from "./extraction/provider.js";
import { createRagAnswerGeneratorFromEnv } from "./rag/llm.js";
import { createRepository, type RepositoryMode } from "./repository.js";
import { createSupabaseStorageUploaderFromEnv } from "./storage/supabaseStorage.js";

loadLocalEnv();

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.API_PORT ?? "8787");
const corsOrigin = process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173";
const repositoryMode = (process.env.DATA_REPOSITORY ?? "mock") as RepositoryMode;
const repository = createRepository({
  mode: repositoryMode,
  databaseUrl: process.env.DATABASE_URL
});
const auth = createAuthConfiguration(process.env);
const demoMode = auth.mode === "demo";
const imageUploader = demoMode ? undefined : createSupabaseStorageUploaderFromEnv(process.env);
const extractionProvider = createExtractionProviderFromEnv(demoMode ? {} : process.env, {
  readImage: imageUploader?.downloadImage.bind(imageUploader)
});
const ragAnswerGenerator = demoMode ? undefined : createRagAnswerGeneratorFromEnv(process.env);

const app = buildApp({ corsOrigin, repository, imageUploader, extractionProvider, ragAnswerGenerator, authMode: auth.mode, authVerifier: auth.verifier });

if (process.env.SERVE_WEB === "true") {
  const webDistDir = fileURLToPath(new URL("../../../web/dist/", import.meta.url));

  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(await readFile(join(webDistDir, "index.html")));
  });

  app.get("/assets/*", async (request, reply) => {
    const assetName = (request.params as { "*": string })["*"];

    if (!/^[A-Za-z0-9._-]+$/.test(assetName)) {
      return reply.code(404).send({ error: "Asset not found" });
    }

    try {
      return reply.type(assetMimeType(assetName)).send(await readFile(join(webDistDir, "assets", assetName)));
    } catch {
      return reply.code(404).send({ error: "Asset not found" });
    }
  });
}

try {
  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

function assetMimeType(fileName: string) {
  const extension = extname(fileName);

  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".woff2") return "font/woff2";
  return "application/octet-stream";
}
