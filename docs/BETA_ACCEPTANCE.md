# 私有 Beta 上线验收包

最后更新：2026-06-02

## 目标

本验收包用于在真实用户资料进入私有 Beta 前，复跑认证、用户隔离、资料录入、RAG 边界、Storage 私有访问、导出删除和日志脱敏检查。它不包含真实密钥，自动化脚本只通过环境变量连接目标 Beta 服务。

## 自动化 Smoke

运行前先准备两个 Supabase Auth 用户，并分别获取 access token。脚本不会打印 token、signed URL、原始上传内容或完整模型回答。

必填环境变量：

```text
BETA_BASE_URL=https://portfolio-intelligence-tracker-beta.onrender.com
BETA_USER_A_TOKEN=<supabase-user-a-access-token>
BETA_USER_B_TOKEN=<supabase-user-b-access-token>
```

可选环境变量：

```text
BETA_SMOKE_IMAGE_PATH=/absolute/path/to/test-image.png
BETA_SMOKE_ALLOW_DELETE=true
```

执行命令：

```bash
npm run smoke:beta --workspace @pit/api
```

脚本固定检查：

- `/health` 返回 `ok=true`。
- 未登录访问 `/dashboard`、`/account/export`、`/rag/query` 返回 `401`。
- User A 可创建文本资料、执行 AI 解析、人工确认，并在 holdings / positions / export 中看到记录。
- User B 不能在 export 或 RAG citations 中看到 User A 的 smoke 记录。
- User A 的 RAG 回答必须有 citations，或明确说明资料不足；不得输出实时行情、买卖建议或保证收益类表达。
- 未设置 `BETA_SMOKE_ALLOW_DELETE=true` 时不会删除账户资料。
- 设置 `BETA_SMOKE_IMAGE_PATH` 时，会额外验证图片上传、signed URL 生成和跨用户图片 URL 隔离。

## Render 环境检查

上线前确认 Beta 服务使用独立 Render service，且关键环境变量只配置在服务端 Secret 中：

- `DATA_REPOSITORY=database`
- `AUTH_MODE=external`
- `DATABASE_URL` 使用 Supabase Session Pooler 连接地址。
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=ingest-uploads`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `MAX_UPLOAD_MB`
- `DAILY_VISION_LIMIT`
- `DAILY_LLM_LIMIT`

如启用模型：

- `DEEPSEEK_API_KEY`
- `RAG_LLM_API_KEY`
- `MOONSHOT_API_KEY`

`VITE_*` 变量会进入浏览器构建产物，只能填写 Supabase 允许公开的 URL 与 anon / publishable key。

## Supabase 检查

- 执行全部 migrations。
- 确认 `sources`、`ingest_items`、`extraction_candidates`、`holdings`、`holding_events`、`quality_events`、`capability_traces`、`daily_capability_usage`、`rag_document_embeddings` 均启用 RLS。
- 使用两个 Supabase 用户做越权测试，确保资料、RAG citations 和图片预览互不可见。
- 关闭不需要的公开注册入口，只保留邀请制或手动创建用户。
- 确认 `ingest-uploads` 是私有 bucket，并限制图片 MIME 类型和上传大小。

## 手工验收

- 登录后可完成文本录入、解析、确认、标的资料库查询、问资料库和导出。
- 配置图片能力后，可上传截图、查看短期 signed URL 预览，并确认 URL 过期后不可继续访问。
- 删除账户资料前先导出备份；删除后确认数据库记录和 Storage object 均被清理。
- 删除 Storage object 失败时，API 应返回失败并保留数据库记录，便于重试。
- 检查 Render 日志不出现模型 key、Supabase service-role key、signed URL、原始资料正文或 Storage object path。
- 检查 `/ops/status` 中 provider、额度、storage 状态符合 Beta 配置。

## 通过标准

- 自动化 smoke 全部必跑项通过，图片和删除项按配置通过或明确跳过。
- 未登录访问业务接口均为 `401`。
- 两个用户互不可见。
- RAG 回答没有资料库外事实或投资建议。
- 日志和导出不包含密钥、signed URL 或未脱敏运维路径。
