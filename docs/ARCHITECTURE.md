# 架构文档

## 当前阶段

当前实现是 React + Fastify + TypeScript monorepo，以 `apps/web`、`apps/api` 和 `packages/shared` 为主路径。早期 Node.js 原生 HTTP 原型已归档到 `legacy/initial-backend-prototype`，仅供回看设计演进。

现行实现覆盖 Drizzle migrations、Supabase Storage 私有图片上传与短期预览、AI extraction 候选记录、人工确认后的 holdings、来源主体/类型/资料日期/报告期元数据、ticker 聚合资料库、基于已确认数据的来源倾向矩阵、可追溯 `RAG + LLM` 对话、认证/数据隔离、导出删除和成本限制。默认开发模式继续使用合成 mock 数据；连接外部服务前必须自行配置私有环境变量并验证访问控制。

## 技术栈

### 已存在但停止扩展

- 运行时：Node.js `>=20`。
- 后端包：原生 ESM JavaScript，包名 `@pit/backend`，版本 `0.1.0`。
- HTTP 服务：Node 内置 HTTP 模块。
- 测试：`node --test`。
- 开发持久化：基于合成 fixtures 的内存 repository。
- 生产持久化目标：Supabase PostgreSQL，通过版本化 SQL migrations 管理。

说明：以上内容仅作为参考实现和需求样例保留，不继续在该框架上新增功能。

### 已锁定的新技术栈

- 前端框架：React + Vite + TypeScript。
- 后端框架：Fastify + TypeScript。
- 数据库访问方式：Drizzle ORM + Supabase PostgreSQL。
- 部署目标：前端 Vercel / Cloudflare Pages，后端优先 Railway，数据库与存储使用 Supabase。
- 测试、lint、typecheck、build 命令：见 `docs/TECH_STACK.md`。
- AI extraction 当前为 Phase 1 最小闭环：规则解析器写回候选字段，后续可替换为 OCR / Vision / LLM。

技术栈已初步锁定，并已创建 `apps/web`、`apps/api`、`packages/shared`。当前 API 默认使用内存 mock repository；设置 `DATA_REPOSITORY=database` 且提供 `DATABASE_URL` 后，可切换到 Drizzle + PostgreSQL repository。该 database repository 已在 Supabase dev 数据库验证 `sources` 与 `ingest_items` 的读取、新增、接受和驳回。

## 边界决策

- 正式 holdings 数据归核心后端和数据库所有。
- RAG 可以读取正式 records，但不拥有、不改写事实源数据。
- extraction candidate 在人工接受前不是正式 holdings。
- Supabase service-role secret 绝不能暴露给前端。
- 本地开发必须在没有云凭证时也能运行，至少能通过 mock / seed data 展示核心流程。

## 目录结构

```text
portfolio-intelligence-tracker/
  README.md
  SECURITY.md
  docs/
    REQUIREMENTS.md
    ARCHITECTURE.md
    DECISIONS.md
    SECURITY.md
    TECH_STACK.md
    API.md
    PUBLISHING_CHECKLIST.md
  apps/
    web/        # 新前端：React + Vite + TypeScript
    api/        # 新后端：Fastify + TypeScript
      drizzle/            # SQL migrations
      src/
        db/                 # Drizzle schema
        repositories/       # mock/database repository implementations
  packages/
    shared/     # 共享类型与 Zod schema
  legacy/
    initial-backend-prototype/
      # 已停止扩展：早期 JS 后端参考实现
      package.json
      .env.example
      docs/
        API.md
        ARCHITECTURE.md
      src/
        domain/
        http/
        repositories/
        services/
      supabase/
        migrations/
        seed/
      test/
```

## 旧后端分层

```text
HTTP router
  -> PortfolioService
    -> Repository interface
      -> MemoryRepository 当前使用
      -> SupabaseRepository 后续实现
```

该分层只作为新架构设计时的参考，不代表最终代码结构。

## 核心数据模型

- `kols`：被追踪的人或账号。
- `sources`：信息源渠道元数据，例如 Twitter、Substack、13F、terminal、article、manual、app。
- `holdings`：正式结构化持仓记录，保留来源主体、来源类型、资料日期与报告期，使跨 KOL / 基金 / 研究材料的倾向聚合可计算且可追溯。
- `holding_events`：人工接受后生成的正式持仓事件记录。
- `holding_snapshots`：某个 KOL 在某个时间点的完整持仓快照。
- `snapshot_holdings`：snapshot 和 holdings 的关联表。
- `holding_events`：自动生成的新开仓、加仓、减仓、清仓等事件。
- `ingest_items`：尚未确认的解析候选记录；录入时同时记录来源主体、类型、资料日期与可选报告期。
- `extraction_candidates`：每次 extraction 的候选结果历史，不直接代表正式事实。
- `alert_rules`：后续提醒规则定义。
- `quality_events`：解析和人工验证相关的质量记录。

## API 范围参考

新后端 API contract 见 `docs/API.md`。旧后端 API contract 见 `legacy/initial-backend-prototype/docs/API.md`，仅作为迁移参考。

当前新 API 覆盖：

- 健康检查。
- Sources。
- Dashboard payload。
- Ingest queue、候选解析与人工确认。
- Holdings、holding events 和 portfolio positions。
- Evidence detail 与短期图片预览。
- 带 citations 的连续 RAG 问答。
- 账户导出、账户删除与运行状态。

## Capability Harness

模型相关能力继续运行在单体 Fastify 服务内，不引入 Agent Loop、Swarm 或微服务。`SkillRegistry` 注册五个原子 skill，并由 `CapabilityRunner` 统一执行：

- `extract_text_signal`：文本或链接候选解析。
- `extract_image_signal`：截图候选解析。
- `retrieve_evidence`：只按当前认证用户 scope 检索资料库。
- `generate_grounded_answer`：基于检索证据生成回答；provider 不可用时回退模板。
- `validate_grounding`：校验 LLM 输出是否越过资料库证据边界。

`image_upload` 仍作为基础设施 capability 经过同一 Runner。Harness 负责原子额度预占、持久化每日 usage、脱敏 trace、超时、有限重试、provider / skill 版本、估算成本和错误分类。trace 不保存原始正文、截图、prompt、signed URL 或密钥。RAG 的 LLM 生成结果还会经过 groundedness 校验；缺少 citations、出现资料库外 ticker 或外部事实/投资建议表达时，回退到确定性模板答案。

### Retrieval 边界

RAG 不再直接调用通用 `PortfolioRepository` 的全量读取接口，而是通过独立 `RagRetrievalRepository` 获取检索快照。数据库实现先将用户 scope、ticker 和候选窗口过滤下推到 PostgreSQL，再批量读取 extraction candidates，避免按录入项逐条查询。

可选 `PgvectorHybridRetriever` 只处理结构化过滤后的文档集合。启用后，系统按文档指纹增量生成 embedding，并将 pgvector 相似度分数与关键词分数合并；embedding provider 或向量查询失败时自动回退关键词检索。默认不开启该能力。

持久化表：

- `capability_traces`
- `daily_capability_usage`

## Repository 边界

`apps/api` 通过 `PortfolioRepository` 隔离路由和数据层：

- `MockPortfolioRepository`：默认实现，使用合成数据和进程内可变状态。
- `DatabasePortfolioRepository`：Drizzle + PostgreSQL 实现，覆盖资料、候选、正式记录与用户隔离。
- `createRepository`：根据环境变量选择实现。

默认配置：

```bash
DATA_REPOSITORY=mock
```

数据库配置：

```bash
DATA_REPOSITORY=database
DATABASE_URL=postgres://...
```

没有真实数据库凭证时，必须继续使用 mock 模式。

公开演示配置：

```bash
AUTH_MODE=demo
DATA_REPOSITORY=mock
SERVE_WEB=true
```

该模式由一个 Fastify 服务同时提供构建后的前端静态文件和 API；每个浏览器使用匿名会话隔离合成内存状态，不连接数据库、Storage 或外部模型服务。

## Migration 与 Seed

版本化 migration 位于 `apps/api/drizzle/`，包含资料持久化、候选历史、正式记录、多用户隔离/RLS、研究来源元数据、Capability Harness 的 trace / usage 表、skill trace 元数据和 pgvector 文档索引。

数据库脚本：

```bash
npm run db:generate --workspace @pit/api
npm run db:migrate --workspace @pit/api
npm run db:seed --workspace @pit/api
```

这些脚本需要 `DATABASE_URL`。默认本地开发不运行数据库脚本，仍使用 `DATA_REPOSITORY=mock`。

## 环境变量

当前本地开发不需要 secrets。

按需配置变量：

- `API_HOST`
- `API_PORT`
- `CORS_ORIGIN`
- `DATA_REPOSITORY`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `RAG_LLM_API_KEY`
- `MOONSHOT_API_KEY`
- `SENTRY_DSN`

`.env.example` 只能放占位值，不能放真实密钥。

## 质量门禁

归档原型参考门禁：

```bash
npm --prefix legacy/initial-backend-prototype test
npm --prefix legacy/initial-backend-prototype run check
```

新工程当前门禁：

```bash
npm run typecheck
npm run test
npm run build
```

其中 `apps/api` 已有 Fastify inject 测试覆盖 `/health`、`/dashboard`、`/sources`、`POST /ingest-items`、accept/reject/update。

## 技术债

- 早期原型已归档至 `legacy/initial-backend-prototype/`，不再扩展。
- 生产部署前仍需在目标 Supabase 环境验证 migration、RLS、备份与监控。
- Auth 已支持本地固定用户模式与 Supabase token 外部模式；业务表已增加 `user_id` 隔离与 RLS migration。
- AI extraction contract 与候选历史已实现；文本/链接可选 DeepSeek-compatible provider，图片可选 Kimi-compatible Vision provider，未配置 key 时使用规则 fallback。
- 人工接受后可写入正式 `holdings` / `holding_events`；标的资料库和问答 citations 均可打开统一证据详情。
- 来源配置 API 已支持 `GET /sources` 与 `PATCH /sources/:name`；入口目前因产品减法未展示在主导航。
- Supabase Storage 已接入用户前缀图片上传、signed URL 预览与账户删除时的对象清理；OCR/检索增强仍可后续扩展。
