# Portfolio Intelligence Tracker

个人投资研究中的有效信号通常并不集中在一张表里，而是分散在 KOL 推文、大型基金 `13F` 披露、研究文章、持仓截图和个人笔记中。单独阅读每一条信息很容易丢失上下文，也很难持续判断：不同来源是否正在关注同一标的、某类资产是否反复出现相似的增持/减持动作、一个判断最初来自哪份资料。

Portfolio Intelligence Tracker 是一个面向个人研究者的投资信息聚合与持仓线索分析平台。它将零散的公开资料和私有研究记录沉淀为可追溯的结构化资料库，按标的聚合来源、操作与时间变化，帮助用户发现跨来源的相似持仓倾向和操作线索，并随时回到原始证据核验结论。

平台提供 AI 解析和基于证据的对话查询，用于降低整理与回溯成本；它不执行交易，也不输出脱离资料来源的投资建议或实时市场判断。

## 解决的问题

- **资料分散**：推文、`13F`、文章、截图和研究备注分布在不同渠道，缺少统一的研究底稿。
- **信号难以横向比较**：单条信息可以阅读，但很难快速识别多个来源对同一 ticker 的共同关注、操作方向与近期变化。
- **结论难以复核**：一段时间后往往只记得“看过某个机会”，却无法定位当时依据的原文或图片。
- **非结构化整理成本高**：截图和文字摘录需要手工转录为标的、动作、来源和时间记录。

## 核心能力

- **多源研究资料归集**：接收来自 KOL 推文、基金披露、研究文章、截图与个人笔记的文本、链接或图片资料。
- **结构化提取与人工确认**：AI 从非结构化资料中识别 ticker、操作方向和摘要；模型结果须经人工确认后才进入正式资料库。
- **持仓倾向聚合分析**：按 ticker 汇总来源、动作和时间事件，展示不同资料中重复出现的标的关注与相似操作线索。
- **原始证据追溯**：从标的资料库或问答引用直接打开原文/原图与解析记录，避免聚合结果脱离依据。
- **基于资料的连续问答**：围绕已确认资料持续提问，可选使用 OpenAI-compatible LLM 组织回答，但只能基于检索到的证据输出。
- **用户数据治理**：支持 Supabase Auth、`user_id` 隔离、RLS migration、账户数据导出和删除。
- **敏感资料保护**：截图存入私有 Storage bucket，预览使用短期 signed URL；API key 仅由服务端读取。

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

## 公开 Demo 部署

仓库包含 `render.yaml`，可部署一个不需要密钥的公开演示实例：

- 前端与 Fastify API 由同一个 Render Web Service 提供。
- `AUTH_MODE=demo` 为每个浏览器分配匿名演示会话，操作不会影响其他访客。
- 数据仅保存在服务进程内，实例重启后恢复合成示例资料。
- Demo 不启用图片上传、数据库、第三方 Vision 或 LLM；问答使用证据约束的模板回退。

部署步骤与正式上线边界见 [docs/DEMO_DEPLOYMENT.md](./docs/DEMO_DEPLOYMENT.md)。

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
