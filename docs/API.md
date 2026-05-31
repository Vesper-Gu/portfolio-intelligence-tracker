# API 文档

最后更新：2026-06-01

## 当前状态

当前正式后端入口为 `apps/api`，使用 Fastify + TypeScript。旧 `legacy/initial-backend-prototype/docs/API.md` 仅保留为参考，不再作为后续实现依据。

Phase 1 API 先使用 `packages/shared` 中的 mock 数据和 Zod schema。当前已具备 Drizzle migration、seed、database repository、Supabase Storage 图片上传、图片 signed URL 预览、AI extraction 最小闭环、DeepSeek 文本解析、多版本候选记录、人工接受后正式 holdings 写入、来源主体/类型/日期/报告期结构化记录、portfolio positions 聚合、基于已确认资料的来源 x 标的倾向矩阵、RAG 问答最小闭环、前端 source trace，并已在 Supabase dev 环境验证主要写入与读取路径；默认仍使用 `DATA_REPOSITORY=mock`，设置 `DATA_REPOSITORY=database` 和 `DATABASE_URL` 后才连接 PostgreSQL。

## 本地运行

```bash
npm run dev
```

默认地址：

- Web：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:8787`

前端通过 `VITE_API_BASE_URL` 指向 API。默认值见 `apps/web/.env.example`。

## 环境变量

`apps/api/.env.example`：

```bash
API_HOST=127.0.0.1
API_PORT=8787
CORS_ORIGIN=http://127.0.0.1:5173
DATA_REPOSITORY=mock
DATABASE_URL=
AUTH_MODE=local-dev
DEV_USER_ID=local-dev-user
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=ingest-uploads
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
RAG_LLM_API_KEY=
RAG_LLM_BASE_URL=https://api.deepseek.com
RAG_LLM_MODEL=deepseek-v4-flash
VISION_PROVIDER=
MOONSHOT_API_KEY=
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
MOONSHOT_VISION_MODEL=kimi-k2.6
MAX_UPLOAD_MB=20
IMAGE_PREVIEW_EXPIRES_IN_SECONDS=300
DAILY_VISION_LIMIT=50
DAILY_LLM_LIMIT=200
LOG_LEVEL=info
```

## Endpoints

### `GET /health`

用途：健康检查。

响应示例：

```json
{
  "ok": true,
  "service": "portfolio-intelligence-tracker-api"
}
```

### `GET /ops/status`

用途：设置页展示 API key 配置状态、成本控制、session 使用量和隐私边界。不会返回任何真实 key。

响应包含：

- `auth`：当前认证模式和验证后的用户 scope。本地模式固定为 `DEV_USER_ID`；生产模式使用 Supabase Bearer token。
- `providers`：文本解析、Vision、RAG LLM 和 Storage 是否配置。
- `costControls`：上传大小、图片预览有效期、Vision / LLM 的日额度。
- `sessionUsage`：当前认证用户持久化保存的当日 RAG 查询、AI 解析和图片上传次数。数据库模式下使用原子 upsert 预占额度，服务重启后不会清零。
- `privacy`：是否存储原图、是否只用 signed URL、LLM 是否只接收检索上下文。

### `GET /account/export`

用途：导出当前用户 scope 下的资料库 JSON。

当前导出内容：

- `ingestItems`
- `extractionCandidates`
- `holdings`
- `holdingEvents`
- `qualityEvents`
- `capabilityTraces`

### `DELETE /account/data`

用途：删除当前认证用户 scope 下的资料库记录与关联截图对象，并返回删除计数。若对象文件删除失败，接口返回错误且不会先清空数据库记录。

### Capability Harness

`POST /rag/query`、`POST /ingest-items/:id/extract` 和 `POST /ingest-items/upload-image` 统一通过 `CapabilityRunner` 执行。每次执行会写入脱敏 trace，包括：

- `capability`
- `status`
- `durationMs`
- `skillName`
- `skillVersion`
- `provider`
- `model`
- `promptVersion`
- `attemptCount`
- `inputUnits`
- `outputUnits`
- `estimatedCostMicrousd`
- `fallbackUsed`
- `inputSummary`
- `outputSummary`
- `errorCode`
- `createdAt`

skill trace 记录的是可比较的粗粒度成本估算，不是供应商账单。trace 不包含原始资料正文、图片内容、prompt、signed URL 或密钥。

### 认证与隔离

- `AUTH_MODE=local-dev` 时后端固定使用 `DEV_USER_ID`，用于本地开发，不接受客户端自行声明用户身份。
- `AUTH_MODE=demo` 时，前端为浏览器生成匿名 `X-Demo-Session-Id`，后端仅使用隔离的合成内存数据；该模式不用于存放真实用户资料。
- `AUTH_MODE=external` 时，除 `/health` 外的接口要求 `Authorization: Bearer <Supabase access token>`。
- migration `0008_multi_user_isolation.sql` 为用户资料表增加 `user_id`、索引与 Supabase 可用时的 RLS policies。

### `GET /dashboard`

用途：总览工作台首屏数据。当前前端总览页已接入该接口；分析区域不再回落展示合成持仓结果。

响应结构：

- `tickerMoves`
- `holdingSignals`
- `evidenceItems`
- `heatmapColumns`
- `heatmapRows`
- `qualitySummary`

该响应由 `dashboardPayloadSchema` 校验。

`heatmapColumns` 与 `heatmapRows` 只依据当前用户状态为 `已确认` 的 holdings 计算；没有已确认资料时为空数组。矩阵行以 `sourceName` 为优先显示名称，列为 ticker，单元格颜色对应最近确认动作。

### `GET /signals`

用途：持仓信号表。

当前返回 `HoldingSignal[]`，字段包括：

- `ticker`
- `action`
- `kolCount`
- `delta`
- `avgWeight`
- `source`
- `evidence`
- `verified`
- `tone`

### `GET /holdings`

用途：查询已由人工接受写入的正式 holdings 记录。

当前返回 `HoldingRecord[]`，字段包括：

- `id`
- `ticker`
- `source`
- `sourceName`：研究主体，例如 KOL 名称或基金名称。
- `sourceType`：`kol_post`、`fund_filing`、`research_article`、`personal_note`、`screenshot` 或 `other`。
- `publishedAt`：原始资料日期，可选。
- `reportingPeriod`：13F 等披露资料的报告期，可选。
- `sourceIngestItemId`
- `lastAction`
- `confidence`
- `status`
- `createdAt`
- `updatedAt`

`status` 当前可能为：

- `已确认`
- `已归档`

### `POST /holdings/:id/archive`

用途：归档一条正式 holding。该接口不删除数据，只把 holding 状态改为 `已归档`，并写入一条 `quality_events` 审计记录。

响应：更新后的 `HoldingRecord`。holding 不存在时返回 `404`。

### `POST /holdings/:id/restore`

用途：恢复一条已归档 holding。该接口把 holding 状态改回 `已确认`，并写入一条 `quality_events` 审计记录。

响应：更新后的 `HoldingRecord`。holding 不存在时返回 `404`。

### `GET /holding-events`

用途：查询人工接受后生成的持仓事件记录。

当前返回 `HoldingEvent[]`，字段包括：

- `id`
- `holdingId`
- `ingestItemId`
- `ticker`
- `action`
- `confidence`
- `summary`
- `createdAt`

### `GET /portfolio/positions`

用途：按 ticker 聚合当前活跃的 accepted holdings，生成 portfolio / position 视图。该接口当前为只读计算，不新增数据库表；归档 holding 不参与聚合。

当前返回 `PortfolioPosition[]`，字段包括：

- `ticker`
- `status`
- `holdingsCount`
- `eventCount`
- `sourceCount`
- `avgConfidence`
- `latestAction`
- `netStance`
- `netScore`
- `bullishEvents`
- `bearishEvents`
- `neutralEvents`
- `sources`
- `lastUpdated`

响应示例：

```json
[
  {
    "ticker": "NET",
    "status": "活跃",
    "holdingsCount": 1,
    "eventCount": 1,
    "sourceCount": 1,
    "avgConfidence": "0.80",
    "latestAction": "观察",
    "netStance": "中性",
    "netScore": 0,
    "bullishEvents": 0,
    "bearishEvents": 0,
    "neutralEvents": 1,
    "sources": ["截图上传"],
    "lastUpdated": "2026-05-21T10:12:40.110Z"
  }
]
```

### `GET /ingest-items`

用途：录入确认队列。

当前返回 `IngestItem[]`，字段包括：

- `id`
- `source`
- `kind`
- `ticker`
- `confidence`
- `status`
- `rawText`
- `storageObjectKey`
- `fileName`
- `mimeType`
- `fileSize`

`source` 与 `storageObjectKey` 属于服务端追溯字段；普通用户界面、聚合来源显示以及发送给 LLM / Vision 的文本上下文不会展示或包含内部 Storage object path、上传字节数或 reviewer note 等运维元数据。

### `GET /ingest-items/:id`

用途：查询单条录入项，用于 accepted holding source trace。

响应：对应的 `IngestItem`。录入项不存在时返回 `404`。
- `extractedTicker`
- `extractedAction`
- `extractedConfidence`
- `extractionSummary`
- `extractedAt`

`status` 当前为枚举：

- `可接受`
- `需人工确认`
- `待复核`
- `已接受`
- `已驳回`
- `已修改`

### `POST /ingest-items`

用途：用户新增一条待解析/待复核录入记录。当前链接和文本使用该接口；图片上传使用 `POST /ingest-items/upload-image`。本接口不做真实 OCR。

请求体：

```json
{
  "source": "https://example.com/portfolio-note",
  "kind": "link",
  "ticker": "UNKNOWN",
  "rawText": "https://example.com/portfolio-note"
}
```

`kind` 当前枚举：

- `link`
- `text`
- `screenshot`

响应：新建的 `IngestItem`，其中 `status` 默认为 `待复核`。

### `POST /ingest-items/upload-image`

用途：上传一张截图或图片到 Supabase Storage，并创建一条 `kind=screenshot` 的待复核记录。

请求类型：`multipart/form-data`

字段：

- `file`：图片文件。

当前允许 MIME type：

- `image/png`
- `image/jpeg`
- `image/webp`

当前文件大小限制：20 MB。

响应：新建的 `IngestItem`，其中：

- `source` 为 `storage://{bucket}/{objectKey}`。
- `storageObjectKey` 为 Supabase Storage object key。
- `fileName`、`mimeType`、`fileSize` 记录原始文件元数据。

### `POST /ingest-items/:id/extract`

用途：对一条录入项运行 AI extraction 最小闭环，生成可人工确认的候选字段。当前实现为可替换 provider：未配置 DeepSeek 时使用规则解析；配置 `DEEPSEEK_API_KEY` 后，文本和链接优先调用 DeepSeek OpenAI-compatible chat completions。该接口不写入正式 holdings。

当前行为：

- 从 `source`、`fileName`、`rawText` 中识别候选 ticker。
- 根据关键词推断候选 action，例如加仓、减仓、新建仓、风险、持有、观察。
- 写入一条 `extraction_candidates` 历史记录。
- 同步写回当前 `ingest_items` 的 `ticker`、`confidence`、`status`，并记录 `extractedTicker`、`extractedAction`、`extractedConfidence`、`extractionSummary`、`extractedAt`。
- 结果仍需用户接受、修改或驳回。

Provider 行为：

- 未配置 `DEEPSEEK_API_KEY`：使用 `rule_v1` 规则解析。
- 配置 `DEEPSEEK_API_KEY`：文本和链接优先使用 `deepseek_text`，失败时回落到 `rule_v1`。
- 配置 `VISION_PROVIDER=kimi`、`MOONSHOT_API_KEY` 且 Supabase Storage 可读取图片时：截图优先使用 Kimi Vision，成功后写入 `provider=vision_llm`。中国区 Moonshot/Kimi key 使用 `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1`。
- 截图 Vision 调用失败时继续回落到规则解析，不阻断人工确认流程。
- 已用真实 DeepSeek API 验证文本录入可生成 `provider=deepseek_text` 的候选历史。
- 候选历史会记录 provider 状态字段：
  - `status`：`success` 或 `fallback`。
  - `fallbackUsed`：是否使用规则 fallback。
  - `retryable`：provider 错误是否适合重试。
  - `providerError`：脱敏后的错误摘要，例如 `provider_invalid_request`。

响应：更新后的 `IngestItem`。

### `GET /ingest-items/:id/extraction-candidates`

用途：查询某条录入项的 extraction 候选历史，避免多次解析覆盖旧结果。

当前返回 `ExtractionCandidate[]`，字段包括：

- `id`
- `ingestItemId`
- `provider`
- `ticker`
- `action`
- `confidence`
- `summary`
- `createdAt`

### `GET /ingest-items/:id/image-url`

用途：为已上传到 Supabase Storage 的截图生成短期 signed URL，供前端人工复核预览使用。

当前行为：

- 只支持 `kind=screenshot` 且存在 `storageObjectKey` 的录入项。
- 使用服务端 Supabase service-role key 生成 signed URL。
- 默认有效期为 300 秒。
- 没有配置 Storage 时返回 `503`。
- 录入项不存在返回 `404`。
- 录入项没有图片对象时返回 `400`。

响应示例：

```json
{
  "url": "https://...signed-url...",
  "expiresInSeconds": 300
}
```

### `POST /ingest-items/:id/accept`

用途：人工接受一条解析候选记录。接受后会把当前人工确认字段写入正式 `holdings`，并生成一条 `holding_events`。重复接受同一条 ingest item 不会重复写 event。

请求体：

```json
{
  "reviewer": "local-user",
  "notes": "optional reviewer note"
}
```

响应：更新后的 `IngestItem`，其中 `status` 为 `已接受`。

### `POST /ingest-items/:id/reject`

用途：人工驳回一条解析候选记录。

请求体：

```json
{
  "reviewer": "local-user",
  "reason": "人工复核判定为暂不采纳"
}
```

响应：更新后的 `IngestItem`，其中 `status` 为 `已驳回`。

### `PATCH /ingest-items/:id`

用途：人工修改解析候选记录字段。

请求体至少包含一个字段：

```json
{
  "ticker": "SMH.US",
  "confidence": "0.93",
  "status": "已修改"
}
```

可修改字段：

- `source`
- `kind`
- `ticker`
- `confidence`
- `status`
- `rawText`
- `storageObjectKey`
- `fileName`
- `mimeType`
- `fileSize`
- `extractedTicker`
- `extractedAction`
- `extractedConfidence`
- `extractionSummary`
- `extractedAt`

响应：更新后的 `IngestItem`。

### `GET /sources`

用途：来源设置页数据。当前前端来源设置页已接入该接口；接口失败时前端回落到本地 mock。

当前返回 `SourceItem[]`，字段包括：

- `name`
- `platform`
- `type`
- `status`
- `lastSync`
- `records`
- `parser`

### `PATCH /sources/:name`

用途：更新来源配置。当前前端来源设置页用该接口保存 `status` 和 `parser`。

请求体至少包含一个字段：

```json
{
  "status": "正常",
  "parser": "filing_position_v2"
}
```

可修改字段：

- `status`
- `parser`

响应：更新后的 `SourceItem`。来源不存在时返回 `404`。

### `GET /quality-summary`

用途：Phase 1 数据质量摘要。

当前返回：

- `pendingReview`
- `lowConfidenceFields`
- `verifiedToday`
- `lastUpdated`

### `GET /quality-events`

用途：查询配置变更、解析质量或人工复核相关事件。当前已用于来源设置页展示 source 配置变更历史。

可选 query：

- `entityId`：按实体 ID 过滤，例如 `SEC 13F` 或 `新闻索引`。

当前返回 `QualityEvent[]`，字段包括：

- `id`
- `entityType`
- `entityId`
- `eventType`
- `severity`
- `summary`
- `metadata`
- `createdAt`

### `POST /rag/query`

用途：基于正式 holdings、portfolio positions、holding events、source ingest raw text 和 extraction candidates 执行证据检索，并返回带 citations 的中文答案。

当前实现是可解释的最小 RAG 闭环：

- 检索层：通过独立 `RagRetrievalRepository` 先执行用户 scope、ticker 和候选窗口过滤，再批量读取关联记录，避免 extraction candidates 的 N+1 查询。
- 混合检索：默认使用可解释关键词分数；显式配置 `RAG_VECTOR_RETRIEVAL=true` 和 embedding provider 后，对过滤后的文档增量建立 pgvector 索引，并合并向量相似度分数。向量服务失败时自动回退关键词检索。
- 意图层：根据问题识别 `position_summary`、`evidence`、`risk`、`recent_changes`、`source_trace` 或 `overview`。
- 生成层：默认按问题意图使用不同的确定性中文模板；配置 `RAG_LLM_API_KEY` 后，会把问题、意图、命中证据、结构化资料库上下文和确定性基线答案交给 OpenAI-compatible LLM 生成更自然的最终回答。
- 边界层：LLM 只能基于本次检索出的资料库上下文和证据回答；不得补充外部事实、实时行情、常识推断或投资建议。证据不足时必须说明资料库不足。
- 引用层：返回命中的 position、holding、event、ingest item 或 candidate。
- 范围层：问题中命中 ticker 时只回答该 ticker；未知 ticker 没有资料时明确提示未找到相关记录。
- 回退层：LLM 未配置或调用失败时，自动返回确定性模板答案。

请求体：

```json
{
  "query": "它有哪些依据？",
  "conversationHistory": [
    { "role": "user", "content": "先看 NET" },
    { "role": "assistant", "content": "NET 当前已有资料库记录。" }
  ],
  "limit": 6
}
```

支持的问题类型示例：

- `NET 当前仓位信号是什么？`
- `NET 有哪些证据？`
- `最近有什么变化？`
- `有什么风险？`
- `这条截图来源是什么？`
- `当前有哪些持仓？`
- 连续追问：先问 `先看 NET`，再问 `它有哪些依据？`

响应字段：

- `query`
- `answer`
- `answerMode`：`llm` 表示 LLM+资料库生成，`template` 表示确定性模板回退。
- `citations`
- `generatedAt`

`citations` 字段包括：

- `id`
- `entityType`
- `entityId`
- `title`
- `snippet`
- `score`

LLM 生成结果会在返回前执行 groundedness 校验。没有 citations、出现资料库外 ticker，或输出外部事实与投资建议表达时，接口返回确定性模板答案并将 `answerMode` 标记为 `template`。

## 下一步 API

建议下一刀补齐 retrieval 评估与 portfolio / position 的数据管理边界：

- 建立关键词检索与混合检索的固定评估集，比较召回率、延迟和 embedding 成本。
- 增加 seed/demo/smoke reset 规范。
- 为 positions 增加显式时间窗口和来源过滤。
- 明确 position 与 future portfolio snapshot 是否需要独立持久化表。
