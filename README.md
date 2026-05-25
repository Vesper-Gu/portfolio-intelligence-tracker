# Portfolio Intelligence Tracker

将散落在 KOL 推文、基金 `13F` 披露、研究文章、截图和个人笔记中的投资研究线索，整理为可追溯、可比较、可连续查询的个人资料库。

[在线体验 Demo](https://portfolio-intelligence-tracker-demo.onrender.com) | [产品介绍](./docs/PROJECT_INTRODUCTION.md) | [架构设计](./docs/ARCHITECTURE.md) | [安全与隐私](./docs/SECURITY.md)

> 这是研究资料管理与线索归纳工具，不执行交易，不提供实时行情判断或投资建议。问答层只应基于用户资料库中检索到的证据回答。

## 为什么做这个项目

个人投资研究经常不是缺少信息，而是信息过于零碎：

- 某位投资者在推文中提到加仓一家公司。
- 某只基金在新一期 `13F` 中新增或减持了同一赛道。
- 一张终端截图或一段个人笔记中记录了值得追踪的线索。
- 数周后想回看判断依据，却已经无法定位原始资料。

单纯收藏链接无法回答更进一步的问题：哪些来源同时在关注某个标的？近期出现了哪些相似的增持或减持动作？一个结论究竟来自哪份原始材料？

Portfolio Intelligence Tracker 的目标是把这些细碎资料转化为研究过程中的结构化底稿：先保存证据，再提取线索，经人工确认后进行跨来源聚合分析，最后通过带引用的对话方式快速回溯已有资料。

## 可以用它做什么

| 研究任务 | 产品支持 |
| --- | --- |
| 收集零散研究资料 | 录入链接、文本与图片来源，统一进入确认队列 |
| 从非结构化信息中抓取要点 | 提取 ticker、动作、摘要、来源与时间等候选字段 |
| 避免 AI 误写事实 | 只有经人工确认的记录才进入正式资料库 |
| 找到跨来源共同倾向 | 按标的汇总来源、动作与时间变化，并提供来源 x ticker 热力矩阵 |
| 回查某条结论的出处 | 从持仓聚合结果和问答引用返回原始资料及确认事件 |
| 连续追问已有研究记录 | 通过 RAG + LLM 对话查询资料库，回答受到检索证据约束 |

例如，在确认过的研究材料基础上，用户可以查询：

- `最近哪些来源都提到了 NVDA？`
- `某只基金和关注的 KOL 是否对同一标的出现相似操作？`
- `SMH 最近的新增仓位记录来自哪里？`
- `我目前资料库中有哪些风险或减仓线索？`

## 使用流程

```text
录入资料（链接 / 文本 / 截图）
        |
        v
AI 提取候选信息（ticker / 动作 / 摘要 / 来源 / 日期）
        |
        v
人工确认或修正
        |
        v
标的资料库与来源倾向矩阵
        |
        v
带原始证据引用的连续问答
```

核心原则是：模型帮助整理信息，但不会绕过人工确认写入正式结论；对话帮助检索与归纳资料，但不补充资料库以外的投资判断。

## 在线 Demo

直接访问：[https://portfolio-intelligence-tracker-demo.onrender.com](https://portfolio-intelligence-tracker-demo.onrender.com)

公开 Demo 预置了合成研究记录，可以体验：

- 总览中的标的聚合、近期变化和来源倾向矩阵。
- 录入确认队列与结构化字段修改流程。
- 标的资料库中的证据追溯。
- 基于已确认演示资料的连续问答。

Demo 为保护访客数据而刻意限制了能力：

- 不接受图片上传，不处理真实投资截图。
- 不连接持久化数据库、第三方 Vision 或外部 LLM。
- 每个浏览器使用隔离的匿名内存会话；服务重启后操作会被重置。
- Render 免费实例闲置后会休眠，首次访问可能需要等待约 50 秒。

因此，公开 Demo 的问答使用证据约束的模板答案；接入私有数据库和服务端 LLM 配置后，正式部署可在相同证据边界内生成更自然的回答。

## 功能状态

| 功能 | 当前实现 |
| --- | --- |
| 多源资料录入与复核 | 已实现 |
| AI extraction 候选与人工确认 | 已实现；默认可用规则解析，支持外部模型配置 |
| 标的聚合、事件变化与来源倾向矩阵 | 已实现 |
| 证据详情与短期图片预览 | 已实现；图片能力仅在私有配置中启用 |
| 连续 RAG 对话与引用列表 | 已实现；LLM 为可选服务端集成 |
| Supabase Auth、用户隔离与 RLS migration | 已实现 |
| 账户数据导出与删除 | 已实现 |
| 公开无密钥演示部署 | 已上线 |

## 技术架构

```text
React + Vite Web App
        |
        v
Fastify API  -----> optional LLM text extraction / evidence-grounded answer generation
        |          optional Vision extraction
        v
Repository interface
   |                    |
mock repository     Drizzle + Supabase PostgreSQL / Private Storage
```

项目采用 TypeScript monorepo：

```text
apps/
  web/        React + Vite 前端
  api/        Fastify API、认证、RAG、Storage 与 Drizzle migrations
packages/
  shared/     Zod schema 与合成演示数据
docs/
  产品、API、架构、隐私、安全和部署文档
legacy/
  initial-backend-prototype/  早期 JavaScript 原型参考
```

## 本地运行

要求：Node.js `>=22`。

```bash
npm install
cp .env.example .env
npm run dev
```

默认配置使用合成数据和内存 repository，不需要数据库或模型密钥：

- Web：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API health：[http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

验证命令：

```bash
npm run typecheck
npm run test
npm run build
```

## 私有部署配置

要允许真实用户保存研究资料或上传截图，必须在服务端配置认证、持久化和隐私保护能力。

| 能力 | 必需配置 |
| --- | --- |
| PostgreSQL 持久化 | `DATA_REPOSITORY=database`, `DATABASE_URL` |
| 多用户认证 | `AUTH_MODE=external`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| 私有截图存储 | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| 文本解析模型 | `DEEPSEEK_API_KEY` |
| 图片解析模型 | `VISION_PROVIDER=kimi`, `MOONSHOT_API_KEY` |
| RAG 自然语言生成 | `RAG_LLM_API_KEY`；未配置时使用确定性答案 |

安全要求：

- `SUPABASE_SERVICE_ROLE_KEY`、数据库连接串与模型密钥只能存在于后端环境变量中。
- 不要将真实截图、用户导出数据、signed URL、密钥或本地 `.env` 提交至 Git。
- 上线处理真实资料前，应验证 RLS、私有 Storage、额度限制、备份告警和正式隐私政策。
- 启用 Vision 或 LLM provider 时，部署者必须向用户说明资料会发送到所配置的模型服务商。

## Demo 部署

仓库提供 [`render.yaml`](./render.yaml)，用于部署无密钥公开演示服务：

```text
Build:  VITE_DEMO_MODE=true npm install && VITE_DEMO_MODE=true npm run build
Start:  npm run start:demo
Health: /health
```

完整说明见 [Demo 部署文档](./docs/DEMO_DEPLOYMENT.md)。

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [产品介绍](./docs/PROJECT_INTRODUCTION.md) | 项目背景、产品目标与简历表达 |
| [需求说明](./docs/REQUIREMENTS.md) | 范围、用户流程与约束 |
| [架构设计](./docs/ARCHITECTURE.md) | 系统结构、数据模型与部署模式 |
| [API 约定](./docs/API.md) | 接口 contract 与鉴权说明 |
| [界面设计](./docs/UI_DESIGN.md) | 交互和视图设计 |
| [隐私说明](./docs/PRIVACY.md) | 用户数据处理边界 |
| [安全设计](./docs/SECURITY.md) | 密钥、上传与访问控制要求 |
| [技术选型](./docs/TECH_STACK.md) | 技术栈与开发命令 |

## 当前定位

当前仓库已具备可公开展示的产品 Demo 与继续开发的核心架构。它适合用于演示“研究资料采集 - 人工确认 - 跨来源倾向分析 - 可追溯问答”的完整闭环；在面向真实用户开放私有资料存储前，仍需完成目标环境中的认证、RLS、存储、监控与隐私合规验证。
