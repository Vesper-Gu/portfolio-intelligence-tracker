import { signalActionSchema, type ExtractionProvider as ExtractionProviderName, type IngestItem, type SignalAction } from "@pit/shared";
import { extractIngestCandidate, extractIngestCandidates, type ExtractionCandidate } from "./ruleExtractor.js";

export interface ExtractionProvider {
  extract(item: IngestItem): Promise<ExtractionCandidate | ExtractionCandidate[]> | ExtractionCandidate | ExtractionCandidate[];
}

export interface DeepSeekExtractionOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface KimiVisionExtractionOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  readImage: (objectKey: string) => Promise<Buffer>;
}

export interface CreateExtractionProviderOptions {
  readImage?: (objectKey: string) => Promise<Buffer>;
}

export function createExtractionProviderFromEnv(env: NodeJS.ProcessEnv, options: CreateExtractionProviderOptions = {}): ExtractionProvider {
  let provider: ExtractionProvider = new RuleExtractionProvider();

  if (env.DEEPSEEK_API_KEY) {
    provider = new FallbackExtractionProvider(
      new DeepSeekTextExtractionProvider({
        apiKey: env.DEEPSEEK_API_KEY,
        baseUrl: env.DEEPSEEK_BASE_URL,
        model: env.DEEPSEEK_MODEL
      }),
      provider
    );
  }

  if (env.VISION_PROVIDER === "kimi" && env.MOONSHOT_API_KEY && options.readImage) {
    provider = new ScreenshotRoutingExtractionProvider(
      new FallbackExtractionProvider(
        new KimiVisionExtractionProvider({
          apiKey: env.MOONSHOT_API_KEY,
          baseUrl: env.MOONSHOT_BASE_URL,
          model: env.MOONSHOT_VISION_MODEL,
          readImage: options.readImage
        }),
        new RuleExtractionProvider()
      ),
      provider
    );
  }

  return provider;
}

export class RuleExtractionProvider implements ExtractionProvider {
  extract(item: IngestItem) {
    return extractIngestCandidates(item);
  }
}

class FallbackExtractionProvider implements ExtractionProvider {
  constructor(
    private readonly primary: ExtractionProvider,
    private readonly fallback: ExtractionProvider
  ) {}

  async extract(item: IngestItem) {
    try {
      return await this.primary.extract(item);
    } catch (error) {
      const fallback = await this.fallback.extract(item);

      return normalizeProviderResult(fallback).map((candidate) => ({
        ...candidate,
        status: "fallback" as const,
        fallbackUsed: true,
        retryable: isRetryableProviderError(error),
        providerError: sanitizeProviderError(error)
      }));
    }
  }
}

class ScreenshotRoutingExtractionProvider implements ExtractionProvider {
  constructor(
    private readonly screenshotProvider: ExtractionProvider,
    private readonly defaultProvider: ExtractionProvider
  ) {}

  extract(item: IngestItem) {
    return item.kind === "screenshot"
      ? this.screenshotProvider.extract(item)
      : this.defaultProvider.extract(item);
  }
}

class DeepSeekTextExtractionProvider implements ExtractionProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly options: DeepSeekExtractionOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.deepseek.com";
    this.model = options.model ?? "deepseek-v4-flash";
  }

  async extract(item: IngestItem): Promise<ExtractionCandidate[]> {
    if (item.kind === "screenshot") {
      const fallback = extractIngestCandidate(item);
      return [{
        ...fallback,
        summary: `${fallback.summary}\nDeepSeek text provider 当前不读取图片二进制；图片需要 OCR/Vision provider。`
      }];
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是投资持仓录入解析器。只输出 JSON，不要输出 markdown。"
          },
          {
            role: "user",
            content: buildPrompt(item)
          }
        ],
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek extraction failed: ${response.status}`);
    }

    const payload = await response.json() as DeepSeekChatResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek extraction returned empty content");
    }

    return normalizeDeepSeekCandidates(content);
  }
}

class KimiVisionExtractionProvider implements ExtractionProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly options: KimiVisionExtractionOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.moonshot.cn/v1";
    this.model = options.model ?? "kimi-k2.6";
  }

  async extract(item: IngestItem): Promise<ExtractionCandidate[]> {
    if (item.kind !== "screenshot" || !item.storageObjectKey) {
      throw new Error("Kimi vision extraction requires a stored screenshot");
    }

    const mimeType = item.mimeType ?? "image/png";
    const image = await this.options.readImage(item.storageObjectKey);
    const imageUrl = `data:${mimeType};base64,${image.toString("base64")}`;
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是投资截图解析器。只输出 JSON，不要输出 markdown。"
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              },
              {
                type: "text",
                text: buildVisionPrompt(item)
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Kimi vision extraction failed: ${response.status}`);
    }

    const payload = await response.json() as DeepSeekChatResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Kimi vision extraction returned empty content");
    }

    return normalizeVisionCandidate(content);
  }
}

function buildPrompt(item: IngestItem) {
  return [
    "请从下面录入内容中抽取投资持仓候选信号，可以有多个 ticker。",
    "输出 JSON schema: {\"signals\":[{\"ticker\":\"string\",\"action\":\"加仓|持有|减仓|新建仓|风险|观察\",\"confidence\":\"0.00-1.00\",\"summary\":\"中文一句话\"}]}",
    "如果无法确定任何 ticker，输出一个 ticker 为 UNKNOWN 的信号；如果无法确定 action，action 使用 观察。",
    `source: ${promptSource(item.source)}`,
    `kind: ${item.kind}`,
    `rawText: ${promptText(item.rawText)}`
  ].join("\n");
}

function buildVisionPrompt(item: IngestItem) {
  return [
    "请读取图片中的投资/持仓信息，抽取图片里出现的投资持仓候选信号，可以有多个 ticker。",
    "输出 JSON schema: {\"signals\":[{\"ticker\":\"string\",\"action\":\"加仓|持有|减仓|新建仓|风险|观察\",\"confidence\":\"0.00-1.00\",\"summary\":\"中文一句话\"}]}",
    "如果图片里没有明确股票代码，输出一个 ticker 为 UNKNOWN 的信号；如果无法确定操作，action 使用 观察。",
    "summary 需要说明你在图片里看到了什么证据，不要编造图片外信息。",
    `source: ${promptSource(item.source)}`,
    `fileName: ${item.fileName ?? "unknown"}`,
    `rawText: ${promptText(item.rawText)}`
  ].join("\n");
}

function promptSource(source: string) {
  return source.startsWith("storage://") ? "截图上传" : source;
}

function promptText(text: string) {
  return text
    .replace(/Image uploaded:[^\n]*/gi, "截图资料")
    .replace(/storage:\/\/\S+/gi, "截图上传")
    .replace(/\n?Storage object:\s*\S+/gi, "")
    .replace(/\n?Reviewer note:[^\n]*/gi, "");
}

function normalizeDeepSeekCandidates(content: string): ExtractionCandidate[] {
  return normalizeProviderCandidates(content, "deepseek_text");
}

function normalizeVisionCandidate(content: string): ExtractionCandidate[] {
  return normalizeProviderCandidates(content, "vision_llm");
}

function normalizeProviderCandidates(content: string, provider: ExtractionProviderName): ExtractionCandidate[] {
  const parsed = JSON.parse(content) as Partial<{
    signals: Array<{
      ticker: string;
      action: string;
      confidence: string | number;
      summary: string;
    }>;
    ticker: string;
    action: string;
    confidence: string | number;
    summary: string;
  }>;
  const rawSignals = Array.isArray(parsed.signals) && parsed.signals.length ? parsed.signals : [parsed];

  return rawSignals.map((signal) => {
    const action: SignalAction = signalActionSchema.catch("观察").parse(signal.action);
    const confidence = normalizeConfidence(signal.confidence);
    const ticker = typeof signal.ticker === "string" && signal.ticker.trim() ? signal.ticker.trim().toUpperCase() : "UNKNOWN";
    const summary = typeof signal.summary === "string" && signal.summary.trim()
      ? signal.summary.trim()
      : `${provider} 解析候选 ticker=${ticker}，action=${action}，confidence=${confidence}。`;

    return {
      provider,
      ticker,
      action,
      confidence,
      summary,
      status: "success",
      fallbackUsed: false,
      retryable: false
    };
  });
}

function normalizeProviderResult(result: ExtractionCandidate | ExtractionCandidate[]) {
  return Array.isArray(result) ? result : [result];
}

function normalizeConfidence(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return "0.50";
  }

  return Math.min(1, Math.max(0, parsed)).toFixed(2);
}

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "Provider call failed";

  if (/429|overloaded|rate limit|timeout|temporarily/i.test(message)) {
    return "provider_retryable";
  }

  if (/401|403|authentication|unauthorized|forbidden/i.test(message)) {
    return "provider_auth_failed";
  }

  if (/400|invalid request|unsupported image|decode image/i.test(message)) {
    return "provider_invalid_request";
  }

  return "provider_failed";
}

function isRetryableProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  return /429|overloaded|rate limit|timeout|temporarily/i.test(message);
}
