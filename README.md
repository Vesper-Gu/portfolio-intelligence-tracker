# Portfolio Intelligence Tracker

面向个人投资研究资料的私有工作台：录入截图、文本或链接，经 AI 提取与人工确认后形成可追溯的标的资料库，并通过带原始证据链接的 `RAG + LLM` 对话查询已有资料。

本项目用于管理研究材料，不提供交易执行、实时行情判断或投资建议。问答层被限制为仅使用用户资料库中检索到的证据。

## 核心能力

- **资料录入与审核**：支持文本、链接和截图录入；模型结果仅作为候选，需人工确认后进入正式资料库。
- **标的资料库**：按 ticker 汇总已确认资料、近期事件和方向；可直接打开原始证据与解析记录。
- **可追溯问答**：根据用户问题检索已确认记录，可选调用 OpenAI-compatible LLM 生成自然语言回复，并提供引用跳转。
- **用户数据治理**：支持 Supabase Auth、`user_id` 隔离、RLS migration、账户数据导出和删除。
- **敏感资料保护**：截图存入私有 Storage bucket，预览使用短期 signed URL；API key 仅由服务端读取。
- **运营边界**：提供模型配置状态、调用额度限制和结构化日志边界，不在界面暴露密钥或内部置信评分。

## 技术架构

```text
React + Vite web app
        |
        v
Fastify API  -----> optional DeepSeek-compatible RAG / text extraction
        |          optional Kimi-compatible vision extraction
        v
Repository interface
   |                    |
mock repository     Drizzle + Supabase PostgreSQL / Storage
```

当前主实现为 TypeScript monorepo：

```text
apps/
  web/        React + Vite 前端
  api/        Fastify API、认证、RAG、Storage 与 Drizzle migrations
packages/
  shared/     Zod schema 与合成演示数据
docs/
  API.md ARCHITECTURE.md PRIVACY.md SECURITY.md UI_DESIGN.md
legacy/
  initial-backend-prototype/  早期 JavaScript 原型，仅作设计演进参考
```

## 快速开始

要求：Node.js `>=22`。

```bash
npm install
cp .env.example .env
npm run dev
```

默认使用不含真实用户资料的内存 mock repository，不需要任何云端密钥：

- Web: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- API health: [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

## 持久化与模型配置

本地 `.env` 不得提交到 Git。以下模式按需启用：

| 能力 | 配置 |
| --- | --- |
| PostgreSQL 持久化 | `DATA_REPOSITORY=database`, `DATABASE_URL` |
| 多用户认证 | `AUTH_MODE=external`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| 私有截图存储 | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| 文本解析 | `DEEPSEEK_API_KEY` |
| 图片解析 | `VISION_PROVIDER=kimi`, `MOONSHOT_API_KEY` |
| RAG 自然语言生成 | `RAG_LLM_API_KEY`，未配置时使用确定性回退答案 |

`SUPABASE_SERVICE_ROLE_KEY`、LLM 密钥和数据库连接串只能位于后端环境变量。不要把 service-role key 写入任何 `VITE_*` 变量。

## 验证

```bash
npm run typecheck
npm run test
npm run build
```

API 测试覆盖录入、确认/驳回、资料追溯、连续问答、账户删除以及不同用户数据隔离。

## 安全与隐私

这是处理研究截图与备注的应用，公开仓库只包含合成 fixtures 和占位配置。

- 不提交 `.env`、真实截图、导出数据、signed URL、账户标识或 provider key。
- 生产部署必须启用认证、RLS、私有 Storage bucket、上传大小/MIME 限制与调用额度限制。
- 启用 Vision 或 LLM provider 时，相关资料内容会发送到所配置的模型服务商；部署者需要向用户说明该处理行为。
- 安全策略见 [SECURITY.md](./SECURITY.md)，隐私边界见 [docs/PRIVACY.md](./docs/PRIVACY.md)。

## 文档

- [产品介绍](./docs/PROJECT_INTRODUCTION.md)
- [需求说明](./docs/REQUIREMENTS.md)
- [架构设计](./docs/ARCHITECTURE.md)
- [API 约定](./docs/API.md)
- [界面设计](./docs/UI_DESIGN.md)
- [隐私说明](./docs/PRIVACY.md)
- [安全设计](./docs/SECURITY.md)
- [技术选型](./docs/TECH_STACK.md)

## 发布状态

当前仓库适合展示与继续开发。部署到真实用户环境前，仍需在目标 Supabase 项目验证 migrations 与 RLS、配置备份与告警，并发布正式隐私政策。
