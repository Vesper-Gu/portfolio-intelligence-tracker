# 技术栈决策

最后更新：2026-05-25

## 目标

本项目使用一套保守、可维护、类型明确的技术栈。旧 `legacy/initial-backend-prototype/` 中的 Node.js 原生 HTTP + JavaScript 实现不再继续扩展，仅作为产品边界、API、schema、seed data 和测试场景参考。

## 选择原则

- 使用成熟主流工具，优先稳定生态和文档完整度。
- JS/TS 项目统一使用 TypeScript。
- 本地开发必须能在没有真实云凭证时运行。
- 前端不得包含 API key、service-role key 或 LLM provider secret。
- 当前聚焦录入、确认、结构化资料库、证据回溯和受约束问答。
- 依赖精确版本在创建新工程骨架时由 `package-lock.json` 锁定；本文件先锁定主版本级技术方向。

## 最终选型

### 仓库结构

使用 npm workspaces 管理单仓多包：

```text
portfolio-intelligence-tracker/
  apps/
    web/        # React + Vite 前端
    api/        # Fastify + TypeScript 后端
  packages/
    shared/     # 共享类型、Zod schema、API contract
  docs/
  legacy/
    initial-backend-prototype/ # 已归档的旧后端参考实现
```

### 前端

- React 19。
- Vite 8。
- TypeScript 5。
- CSS Modules 或普通 CSS 起步；暂不引入大型 UI 组件库。

理由：

- 当前产品是桌面端研究工作台，不需要 SEO 和 SSR。
- Vite + React 比 Next.js 更轻，适合高密度内部工具。
- 不引入大型组件库，避免 Bloomberg Terminal 风格被通用 SaaS 组件限制。

### 后端

- Node.js 22 LTS。
- Fastify 5。
- TypeScript 5。
- Zod 4 用于 request / response schema。
- Node `--test` 用于 API 核心流程测试。

理由：

- 保留 JS/TS 全栈一致性，但放弃旧的原生 HTTP + JavaScript。
- Fastify 比手写 HTTP 更工程化，schema、plugin、hook 和测试生态更完整。
- TypeScript + Zod 能把 API contract 固化下来，减少前后端漂移。

### 数据库与存储

- 开发：本地 mock / seed data 起步；需要数据库时使用 Supabase local 或远程 dev project。
- 生产：Supabase PostgreSQL。
- ORM / query layer：Drizzle ORM。
- PostgreSQL client：`postgres`。
- 文件存储：Supabase Storage，用于私有原始截图归档与短期签名预览。
- 后续如需语义向量检索，可在 Supabase PostgreSQL 内启用 pgvector。

理由：

- 产品核心是结构化 holdings、source、snapshot、quality events，PostgreSQL 合适。
- Supabase 提供 Postgres、Storage、未来 Auth 和 pgvector，能降低运维复杂度。
- Drizzle 类型轻量，适合 TypeScript 后端和 SQL-first migration 思路。

### AI / RAG 边界

- 未配置模型 key 时，文本解析与问答使用确定性 fallback，项目仍可在本地运行。
- 文本资料可选 DeepSeek-compatible extraction provider；截图可选 Kimi-compatible Vision provider。
- RAG 先从当前用户已确认记录检索 evidence，再可选调用 OpenAI-compatible LLM 组织回答。
- LLM prompt 明确限制回答范围，不补充资料库外事实、实时行情或投资建议。
- citations 包含原始资料映射，用户可从回答返回证据详情核验内容。

### 部署目标

Phase 1 默认：

- 前端：Vercel 或 Cloudflare Pages。
- 后端：Railway / Fly.io / Render 三选一，优先 Railway。
- 数据库与文件：Supabase。

本地开发：

- 前端和后端分开启动。
- 后端可在无 Supabase 凭证时使用 seed data / mock repository。

## 环境变量

根目录 `.env.example` 保留占位值。实际工程创建后，按 app 拆分：

```text
apps/web/.env.example
apps/api/.env.example
```

后端变量：

```bash
API_HOST=127.0.0.1
API_PORT=8787
CORS_ORIGIN=http://127.0.0.1:5173
DATA_REPOSITORY=mock
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEEPSEEK_API_KEY=
RAG_LLM_API_KEY=
VISION_PROVIDER=
MOONSHOT_API_KEY=
SENTRY_DSN=
```

前端变量：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

禁止把 `SUPABASE_SERVICE_ROLE_KEY`、LLM API key 或任何 server-side secret 放进前端。

## 质量门禁

新工程骨架创建后，根目录应提供：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

脚本含义：

- `lint`：检查 `apps/web`、`apps/api`、`packages/shared`。
- `typecheck`：前端、后端、shared package 全量 TypeScript 检查。
- `test`：Node test runner 执行 API service、认证隔离和核心业务流程测试。
- `build`：构建 shared、api、web。

发布前额外运行 secret scan：

```bash
rg -n "(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY|SUPABASE_SERVICE_ROLE|SERVICE_ROLE|password|passwd|secret|api[_-]?key|token|PRIVATE_KEY|client_secret)" .
```

## 旧后端处理策略

当前策略：旧实现已归档到 `legacy/initial-backend-prototype/`，不继续开发。

归档代码保留用于：

1. 从旧 `legacy/initial-backend-prototype/supabase/migrations/0001_core_schema.sql` 回看数据模型来源。
2. 从旧 `legacy/initial-backend-prototype/docs/API.md` 回看 API contract 演进。
3. 从旧 `legacy/initial-backend-prototype/src/repositories/seedData.js` 回看 mock data 设计。
4. 从旧 `legacy/initial-backend-prototype/test/portfolioService.test.js` 回看测试场景。

## 当前不选的方案

### Next.js 全栈

不选原因：

- 当前产品不需要 SSR / SEO。
- API、RAG、截图处理和后续后台任务会让 Next.js API Routes 逐步变重。
- 分离 web/api 更清晰。

### Python FastAPI 作为 Phase 1 主后端

不选原因：

- Phase 1 主要是结构化 CRUD、聚合、确认队列和前端工作台，不需要 Python AI 生态先介入。
- Phase 2 RAG 如果需要 Python，可以作为独立服务接入。

### 继续使用旧 Node.js 原生 HTTP 后端

不选原因：

- 缺少框架层约束和类型化工程结构。
- 用户已明确不希望沿用该技术栈。
- 后续功能增加后维护成本高。
