import { buildApp } from "./app.js";
import { createAuthConfiguration } from "./auth.js";
import { loadLocalEnv } from "./env.js";
import { createExtractionProviderFromEnv } from "./extraction/provider.js";
import { createRagAnswerGeneratorFromEnv } from "./rag/llm.js";
import { createRepository, type RepositoryMode } from "./repository.js";
import { createSupabaseStorageUploaderFromEnv } from "./storage/supabaseStorage.js";

loadLocalEnv();

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "8787");
const corsOrigin = process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173";
const repositoryMode = (process.env.DATA_REPOSITORY ?? "mock") as RepositoryMode;
const repository = createRepository({
  mode: repositoryMode,
  databaseUrl: process.env.DATABASE_URL
});
const imageUploader = createSupabaseStorageUploaderFromEnv(process.env);
const extractionProvider = createExtractionProviderFromEnv(process.env, {
  readImage: imageUploader?.downloadImage.bind(imageUploader)
});
const ragAnswerGenerator = createRagAnswerGeneratorFromEnv(process.env);
const auth = createAuthConfiguration(process.env);

const app = buildApp({ corsOrigin, repository, imageUploader, extractionProvider, ragAnswerGenerator, authMode: auth.mode, authVerifier: auth.verifier });

try {
  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
