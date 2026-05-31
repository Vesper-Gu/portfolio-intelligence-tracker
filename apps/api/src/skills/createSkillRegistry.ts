import type { PortfolioRepository } from "../repositories/portfolioRepository.js";
import type { ExtractionProvider } from "../extraction/provider.js";
import type { RagAnswerGenerator } from "../rag/llm.js";
import { ExtractImageSignalSkill, ExtractTextSignalSkill } from "./extractionSkills.js";
import { SkillRegistry } from "./registry.js";
import { GenerateGroundedAnswerSkill, RetrieveEvidenceSkill, ValidateGroundingSkill } from "./ragSkills.js";
import { createPortfolioRagRetrievalRepository } from "../rag/retrieval.js";
import { createPgvectorHybridRetrieverFromEnv } from "../rag/pgvector.js";

interface CreateSkillRegistryOptions {
  repository: PortfolioRepository;
  extractionProvider: ExtractionProvider;
  ragAnswerGenerator?: RagAnswerGenerator;
  env?: NodeJS.ProcessEnv;
}

export function createSkillRegistry(options: CreateSkillRegistryOptions) {
  const env = options.env ?? process.env;
  const retrievalRepository = createPortfolioRagRetrievalRepository(options.repository);
  const vectorRetriever = createPgvectorHybridRetrieverFromEnv(env);

  return new SkillRegistry()
    .register(new ExtractTextSignalSkill({
      provider: options.extractionProvider,
      model: env.DEEPSEEK_MODEL || "rule-v1"
    }))
    .register(new ExtractImageSignalSkill({
      provider: options.extractionProvider,
      model: env.MOONSHOT_VISION_MODEL || "rule-v1"
    }))
    .register(new RetrieveEvidenceSkill(retrievalRepository, vectorRetriever))
    .register(new GenerateGroundedAnswerSkill(
      options.ragAnswerGenerator,
      env.RAG_LLM_MODEL || env.DEEPSEEK_MODEL || "deepseek-v4-flash"
    ))
    .register(new ValidateGroundingSkill());
}
