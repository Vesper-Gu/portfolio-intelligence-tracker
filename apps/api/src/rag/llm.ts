import type { RagCitation } from "@pit/shared";
import type { RagIntent } from "./query.js";

export interface RagAnswerInput {
  query: string;
  conversationContext: string;
  intent: RagIntent;
  deterministicAnswer: string;
  contextSummary: string;
  citations: RagCitation[];
}

export interface RagAnswerGenerator {
  generate(input: RagAnswerInput): Promise<string>;
}

export interface RagLlmAnswerGeneratorOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export function createRagAnswerGeneratorFromEnv(env: NodeJS.ProcessEnv): RagAnswerGenerator | undefined {
  const apiKey = env.RAG_LLM_API_KEY || env.DEEPSEEK_API_KEY;

  if (!apiKey) return undefined;

  return new OpenAiCompatibleRagAnswerGenerator({
    apiKey,
    baseUrl: env.RAG_LLM_BASE_URL || env.DEEPSEEK_BASE_URL,
    model: env.RAG_LLM_MODEL || env.DEEPSEEK_MODEL
  });
}

class OpenAiCompatibleRagAnswerGenerator implements RagAnswerGenerator {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly options: RagLlmAnswerGeneratorOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.deepseek.com";
    this.model = options.model ?? "deepseek-v4-flash";
  }

  async generate(input: RagAnswerInput) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: [
              "你是一个投资研究资料库问答助手。",
              "你只能基于本次 prompt 中的“资料库上下文”和“已检索到的证据”回答。",
              "不要使用任何外部知识、实时行情、常识推断、网络信息或你训练中记住的信息补全答案。",
              "如果资料库上下文没有覆盖用户问题，要明确说当前资料库没有相关记录或证据不足。",
              "回答要自然、具体、简洁，中文输出，不要使用 Markdown 标记或 Markdown 表格。",
              "可以做轻量归纳，但每个结论都必须能被资料库上下文或证据支持。",
              "不要提及置信度、内部 score 或模型推理过程。"
            ].join("\n")
          },
          {
            role: "user",
            content: buildPrompt(input)
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`RAG LLM answer failed: ${response.status}`);
    }

    const payload = await response.json() as OpenAiCompatibleChatResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("RAG LLM answer returned empty content");
    }

    return content;
  }
}

function buildPrompt(input: RagAnswerInput) {
  const evidence = input.citations.length
    ? input.citations.map((citation, index) => (
      `[${index + 1}] ${citation.title}\n类型: ${citation.entityType}\n实体: ${citation.entityId}\n摘要: ${citation.snippet}`
    )).join("\n\n")
    : "无命中证据";

  return [
    `用户问题：${input.query}`,
    `最近对话：${input.conversationContext || "无"}`,
    `问题意图：${input.intent}`,
    "",
    "已检索到的资料库证据：",
    evidence,
    "",
    "资料库结构化上下文：",
    input.contextSummary,
    "",
    "确定性基线答案：",
    input.deterministicAnswer,
    "",
    "请结合资料库证据和基线答案，生成更自然的最终回答。要求：",
    "1. 只基于资料库上下文和证据回答，不要补充资料库以外的信息。",
    "2. 如果证据不足，直接说明缺少哪些资料，不要猜测。",
    "3. 保留关键 ticker、动作、来源或时间。",
    "4. 不要输出投资建议。",
    "5. 不要写“根据常识”“市场通常”“我认为”等脱离资料库的判断。"
  ].join("\n");
}

interface OpenAiCompatibleChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}
