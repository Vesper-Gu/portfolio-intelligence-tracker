# 决策记录

## 2026-06-01：RAG 增加独立 Retrieval 边界与可选 pgvector 混合检索

背景：早期 RAG 查询会读取当前用户全部结构化资料，并按每条 ingest item 单独查询候选历史。资料量扩大后会形成不必要的全量读取和 N+1 查询。

决策：新增 `RagRetrievalRepository`，数据库实现优先下推用户 scope、ticker 和窗口过滤，并批量读取候选历史。新增默认关闭的 `PgvectorHybridRetriever`：只对过滤后的候选文档按指纹增量建立 embedding 索引，并将向量相似度与关键词分数合并；provider 失败时回退关键词检索。

理由：先缩小结构化候选集，再做向量增强，可以控制隐私暴露面、延迟和 embedding 成本，同时保持无模型 key 的默认路径可用。

## 2026-06-01：将 provider 收敛为五个原子 Skill

背景：第一阶段 Harness 已统一 usage、trace 和 groundedness，但路由仍直接理解 extraction 与 RAG 的执行细节，provider 版本、重试和估算成本缺少统一 contract。

决策：新增 `SkillRegistry` 与 `Skill` contract，将文本解析、图片解析、RAG 检索、回答生成和 groundedness 校验拆成五个原子 skill。`CapabilityRunner` 执行 skill，统一处理超时、有限重试、脱敏 trace、provider / skill 版本和粗粒度估算成本。RAG 继续按固定流水线执行，不允许模型自主选择工具。

理由：该层将 provider 替换、观测和测试边界稳定下来，同时避免在产品任务尚不需要自主规划时引入 Agent Loop 的额外复杂度。

## 2026-06-01：采用受约束 Capability Harness，不引入 Agent Loop

背景：文本解析、Vision 解析和 RAG + LLM 已经形成可用闭环，但模型调用的额度、耗时、错误分类和运行轨迹分散在路由与 provider 中。私有 Beta 需要在保持资料库事实边界的前提下提高可观测性和成本控制。

决策：新增统一 `CapabilityRunner`，包裹 `extract_signal`、`rag_query` 和 `image_upload`。Harness 使用 PostgreSQL 持久化每日 usage 和脱敏 trace；数据库模式通过原子额度预占限制并发调用。RAG 的 LLM 输出增加 groundedness 校验，缺少 citations、出现资料库外 ticker 或外部事实/投资建议表达时回退确定性模板。

暂不采用：

- 开放式 Agent Loop。
- Agent Swarm。
- 独立微服务。
- 允许 LLM 直接访问数据库或网络搜索。

理由：当前核心任务是可靠整理和查询用户资料，不需要模型自主规划多步工具调用。先补 Harness 可以获得可观测性、成本控制和回答边界，同时保持现有单体结构简单可维护。

## 2026-05-22：总览收敛为资料库工作流首页

背景：内测视角下，原总览页仍偏功能展示型 dashboard，包含 Tape、热力图、静态 RAG 证据面板等演示型模块。用户更需要每天打开后立即看到当前聚合仓位、最近变化、待处理资料和可直接提问的问题。

决策：总览页收敛为资料库工作流首页，核心保留 `当前关注标的 / Portfolio Positions`、`最近变化 / Recent Events`、`待处理资料 / Review Queue` 和 `快速提问 / Ask Library`，同时保留 `KOL × Ticker 热力图` 作为辅助观察模块。隐藏来源设置主导航入口；来源设置代码和 API 暂时保留，后续作为二级设置入口再规划。用户可见文案弱化 `RAG`，改用“问资料库”表达。

备选方案：

- 保留原 Bloomberg Terminal 式完整 dashboard。
- 只改文案，不改首页结构。
- 立即新增完整持仓详情页承载所有明细。

理由：

- 当前产品核心价值是“存资料 -> 确认持仓 -> 问资料库”，首页应服务这条工作流。
- 演示型图表在真实 KOL/source 数据不足时会增加噪音；热力图仅作为辅助观察，不承载主要工作流。
- 明细和审计能力应进入详情页，而不是占据总览。

约束：

- 聚合仓位仍基于正式 holdings 和 holding events。
- 来源设置、source trace、accepted holdings 明细能力仍保留在 API / 数据层，等待新的产品位置。
- 后续新增详情页前，总览不重新加入底层明细表。

## 2026-05-24：新增标的资料库作为核心页面

背景：内测评审后确认，产品不能只停留在“录入队列 + 总览 + 问答”。用户需要一个稳定位置查看已经加入资料库的标的，否则“加入资料库”的价值链不够清楚，总览也容易重新堆叠明细。

决策：左侧导航新增 `标的资料库 / Ticker Library`。该页面按 ticker 聚合正式 holdings、portfolio positions 和 holding events，展示方向、最新动作、资料数量、来源和最近事件，并提供“问这个标的”和“查看依据”入口。录入页用户动作从“接受”改为“加入资料库”，弱化后台审核感。

理由：

- 产品核心链路应表达为“录入资料 -> 加入资料库 -> 按标的查看 -> 问资料库”。
- 标的资料库承载已确认记录的日常查看，总览只保留摘要和入口。
- 问答入口从具体 ticker 出发，比泛化 RAG 更符合投研使用习惯。

约束：

- Source trace 和完整候选历史仍不直接塞回总览。
- 当前页面先复用现有 API，不新增复杂后端聚合接口。

## 2026-05-22：RAG 增加可选 LLM 生成层

背景：intent-based RAG 已能按问题类型给出不同确定性回答，但表达仍偏模板。用户希望结合大语言模型和知识库，让回答更自然、更像真正理解问题，同时仍基于已存入的数据。

决策：在现有 RAG 检索层之后增加可选 OpenAI-compatible LLM 生成层。系统先检索用户知识库并生成确定性基线答案，再把用户问题、问题意图、citations 和基线答案交给 LLM。LLM 只能基于这些证据回答，不能编造外部事实或投资建议。未配置 `RAG_LLM_API_KEY` 或 LLM 调用失败时，自动回退到确定性模板答案。

备选方案：

- 直接做完整 agent。
- 直接让 LLM 访问数据库并自由回答。
- 继续只使用确定性模板。

理由：

- 当前需求是单次问答质量，不需要 agent 的多步规划和工具执行。
- 先检索再生成可以保留事实边界和 citations，可控性高于让 LLM 自由查库。
- fallback 能保证本地开发和无 key 环境不受影响。

约束：

- LLM prompt 不允许暴露 secrets。
- LLM 回答不得声称知道证据之外的信息。
- 后续如需外部搜索、自动跟踪或主动提醒，再评估 agent。

## 2026-05-22：RAG 回答按问题意图分支

背景：最小 RAG 闭环已经能从 positions、holdings、events、ingest items 和 extraction candidates 中检索证据，但早期回答模板固定，不同问题容易得到相似答案，用户会感觉没有真正基于问题作答。

决策：保留当前不依赖 embedding / LLM 的最小实现，但先加入问题意图识别和差异化回答模板。当前支持 `position_summary`、`evidence`、`risk`、`recent_changes`、`source_trace` 和 `overview` 六类意图。问题中命中 ticker 时只回答该 ticker；问题中出现未知 ticker 且没有资料命中时，明确提示当前资料中没有相关记录。

备选方案：

- 立即接入 embedding / pgvector。
- 立即接入可配置 LLM 生成层。
- 继续使用一个固定回答模板。

理由：

- 当前主要问题是模板不区分意图，不是检索基础设施缺失。
- 确定性模板更容易测试，适合在核心数据闭环尚未稳定时迭代。
- 先把“基于用户存入的数据作答”做清楚，再决定是否引入 embedding 和 LLM。

约束：

- 回答不得虚构未存入的资料。
- 未命中用户数据时应明确说明没有找到，而不是回退到泛化结论。
- citations 仍保留内部 score 字段以兼容 API schema，但用户界面不展示 score。

## 2026-05-22：第一版前端隐藏 confidence 并从总览移除 Source Trace

背景：当前产品能力已经覆盖录入、解析、人工确认、正式 holdings、portfolio positions、source trace 和最小 RAG，但用户反馈第一版功能显得复杂。尤其是 `confidence` / `avgConfidence` 这类可信评分对实际判断帮助有限，Source Trace 在总览页展示过重，会把总览从“持仓看板”变成“审计详情页”。

决策：第一版用户界面不展示 confidence、avg confidence 或 RAG citation score。相关字段暂时保留在 shared schema、API、数据库和测试中，作为兼容历史数据和 provider 内部诊断的实现细节。总览页移除 Source Trace 详情块，只保留持仓信号、证据摘要、热力图、portfolio positions 和 accepted holdings。Source Trace 能力继续保留在 API 和数据层，后续重新放到录入项详情、持仓详情页或独立证据页。

备选方案：

- 彻底从 schema、migration 和数据库中删除 confidence 字段。
- 保留总览页 Source Trace，但默认折叠。
- 继续在所有表格和候选历史中展示 confidence。

理由：

- 先做展示层减法，不做破坏性 migration，风险最低。
- 用户当前更需要“存入资料后能确认持仓并提问”，而不是查看内部评分。
- Source Trace 是复核和审计能力，不应占用总览首页的大面积空间。
- 后续如果确认完全不需要 confidence，再用单独 slice 做数据库字段清理。

约束：

- API contract 暂时仍包含 confidence 字段，避免影响已有 dev 数据、mock 数据和测试。
- RAG 回答不得再向用户输出平均置信度或 citation score。
- 后续新增 UI 时，除非明确是调试/开发模式，不应把 provider 内部评分暴露给普通用户。

## 2026-05-19：Phase 1 聚焦数据闭环

背景：产品规格同时包含录入、可视化、RAG、热力图、提醒和新闻集成。

决策：Phase 1 聚焦正式结构化 holdings、ingest review、来源可追溯、KOL / ticker 聚合和质量指标。RAG 保留到 Phase 2。

备选方案：

- 立即实现 RAG。
- 在持久化稳定前先做完整 dashboard。

理由：如果没有干净的正式记录和确认流程，语义检索会放大脏数据，后续纠错成本更高。

## 2026-05-19：RAG 作为独立边界

背景：Google Doc 中规划了 LlamaIndex、pgvector、embedding 和答案生成。

决策：RAG 可以通过稳定 contract 读取正式 holdings 和 source records，但不拥有事实源数据。

备选方案：

- 在第一版 holdings migration 中直接加入 embedding。
- 让 RAG 服务维护唯一 holdings 表示。

理由：核心产品必须在检索实验更换 provider 或架构时仍然可用、可测试。

## 2026-05-19：Supabase PostgreSQL 作为生产持久化目标

背景：产品需要结构化记录、source metadata、snapshots、未来向量检索和截图存储。

决策：正式数据使用 Supabase PostgreSQL，后续原始截图使用 Supabase Storage。

备选方案：

- 只使用 SQLite。
- 第一天就引入独立 managed vector database。
- 使用 Airtable / Notion 类 no-code 存储。

理由：PostgreSQL 很适合关系型数据模型，Supabase 运维成本低，并且 Phase 2 可以继续使用 pgvector。

## 2026-05-19：本地开发不依赖凭证

背景：项目需要快速迭代，并降低早期 secret 泄露风险。

决策：后端在配置 Supabase 凭证前，可以使用内存 repository 和合成 seed data 运行。

备选方案：

- 第一次运行就强制依赖 Supabase。
- 只在前端 mock 所有 API。

理由：无凭证本地开发更容易验证第一批 slice，也能降低泄露密钥的风险。

## 2026-05-19：放弃现有 JS 后端框架，重选技术栈

背景：仓库中已有一版 Node.js 原生 HTTP + JavaScript 的早期后端参考实现，但用户判断该技术栈与目标方向不符。

决策：停止在现有 `backend/` 框架上继续开发业务功能。保留旧后端作为参考资料，用于迁移数据模型、API 边界、seed data 和测试场景；下一步重新确认技术栈并重建工程骨架。

备选方案：

- 继续沿用现有 JS 后端并逐步迁移。
- 直接删除旧后端。
- 在旧后端内局部替换框架。

理由：继续在不符合目标技术栈的框架上投入会增加迁移成本。直接删除会丢掉已整理出的产品边界和 schema 参考，因此先标记为废弃参考实现更稳妥。

后续要求：

- 新技术栈确认前不新增业务代码。
- 新架构文档确认后，再决定是否删除或归档旧 `backend/`。
- 新工程必须重新定义本地运行、测试、lint、typecheck、build 和 secret scan 门禁。

## 2026-05-19：新工程采用 React/Vite + Fastify + Supabase

背景：旧后端已停止扩展，需要按保守、主流、类型明确的原则选择新技术栈。

决策：新工程采用 npm workspaces 单仓结构：`apps/web` 使用 React + Vite + TypeScript，`apps/api` 使用 Fastify + TypeScript，`packages/shared` 存放共享类型和 Zod schema。数据库继续使用 Supabase PostgreSQL，TypeScript 数据访问使用 Drizzle ORM。

备选方案：

- Next.js 全栈。
- Python FastAPI 作为 Phase 1 主后端。
- 继续扩展旧 Node.js 原生 HTTP 后端。

理由：

- 产品是桌面端高密度研究工作台，不需要 SSR / SEO。
- Vite + React 更轻，更适合快速实现 Bloomberg Terminal 风格的前端。
- Fastify + TypeScript 比旧手写 HTTP 更可维护，并保留 JS/TS 全栈一致性。
- Supabase PostgreSQL 符合结构化 holdings、Storage、未来 Auth 和 pgvector 的需求。

约束：

- Phase 1 不实现 RAG，只保留数据字段和 API 边界。
- 后端必须支持无云凭证的 seed/mock 运行模式。
- 精确依赖版本由创建新工程骨架时的 `package-lock.json` 固化。

## 2026-05-20：先用 shared + mock API 打通前后端闭环

背景：前端 Bloomberg Terminal 风格 mock 已完成，但如果继续只在前端堆 mock，会让字段契约和后端实现分叉。

决策：创建 `packages/shared` 作为 Zod schema、共享 TypeScript 类型和 Phase 1 mock data 的单一来源；创建 `apps/api` Fastify 服务，先用 mock repository 暴露只读接口；前端总览页优先接入 `GET /dashboard`，API 失败时保留本地 fallback。

备选方案：

- 直接接 Supabase/Drizzle。
- 继续只做前端静态 mock。
- 在前端和后端分别维护 mock 数据。

理由：

- shared package 可以尽早稳定字段契约，减少前后端重复定义。
- mock API 能验证运行、CORS、类型、构建和测试闭环。
- 暂不接 Supabase 可以避免把数据库迁移、凭证和 UI 联调混在同一刀里。

约束：

- mock repository 只是本地开发路径，不代表生产持久化方案。
- 下一步进入写入闭环前，需要把 ingestion review 的状态和请求 schema 纳入 shared。

## 2026-05-20：录入确认先做可变内存写入

背景：Phase 1 的关键业务流是将解析候选记录通过人工确认变成可信记录。当前尚未接入 Supabase，不应把数据库迁移、凭证和 UI 工作流混在同一 slice。

决策：先在 `packages/shared` 收紧 ingestion 状态和请求 schema，在 `apps/api` 的 mock repository 中实现可变内存状态，并让前端录入确认队列调用 accept/reject/update API。

备选方案：

- 直接实现 Supabase 写入。
- 继续保持录入确认页为纯前端静态交互。
- 只做 API，不接前端按钮。

理由：

- 可变内存写入足以验证“人工确认 -> 状态变化”的产品闭环。
- shared schema 先行能降低后续接数据库时的字段迁移风险。
- 保持无凭证可运行，符合当前安全和开发效率约束。

约束：

- 当前写入只在 API 进程内有效，重启后恢复 mock 初始数据。
- 下一步接持久化时，必须保留 mock fallback，避免本地开发被 Supabase 凭证阻塞。

## 2026-05-20：新增录入先记录内容和图片元信息

背景：用户需要在录入队列页新增链接、文本和图片。当前系统尚未接入 Supabase Storage、OCR 或异步解析任务。

决策：本阶段新增 `POST /ingest-items` 和前端“新增录入”面板。链接和文本直接写入 `rawText`；图片只读取浏览器端文件名、MIME 类型和大小，作为 `screenshot` 类型记录进入 `待复核` 队列，不上传二进制。

备选方案：

- 立即接入 Supabase Storage 并上传原始图片。
- 立即做 OCR / Vision extraction。
- 只支持链接和文本，推迟图片入口。

理由：

- 这能先打通“用户提交 -> 进入队列 -> 人工确认”的业务闭环。
- 不处理图片二进制可以避免在未设计存储权限、文件大小限制和隐私策略前引入安全风险。
- 未来接 Storage/OCR 时，`kind=screenshot` 的队列记录可以继续复用。

约束：

- 当前图片记录不可预览原图，不能作为事实证据长期保存。
- 接入真实上传前，需要补充文件大小限制、MIME 白名单、存储桶权限和删除策略。

## 2026-05-20：持久化采用 mock/database repository 切换

背景：录入队列已经有新增、接受、驳回和修改字段闭环，但 mock repository 重启即丢数据。直接切真实 Supabase 会让本地开发依赖凭证。

决策：引入 Drizzle ORM 和 `postgres` client，先定义 `sources` 与 `ingest_items` schema，并拆分 repository 实现。默认 `DATA_REPOSITORY=mock`，只有显式设置 `DATA_REPOSITORY=database` 且提供 `DATABASE_URL` 时才走 database repository。

备选方案：

- 直接强制所有本地开发连接 Supabase。
- 继续只用内存 mock。
- 在前端 localStorage 做临时持久化。

理由：

- repository contract 让路由和数据源解耦，后续迁移到 Supabase 不需要重写 API handler。
- 默认 mock 保持无凭证可运行，符合当前安全和开发效率要求。
- Drizzle schema 先落地，有助于下一步生成 migration 和 seed。

约束：

- 当前 database repository 尚未通过真实 Supabase dev 数据库验证。
- `DATABASE_URL` 和 service-role key 只能存在后端环境，不能进入前端。

## 2026-05-20：先提交 SQL migration 与 seed 脚本

背景：Drizzle schema 和 database repository 已存在，但没有可执行的 migration/seed，无法在 Supabase dev 数据库复现实验环境。

决策：为 `sources` 与 `ingest_items` 提供初始 SQL migration，并增加 `db:migrate`、`db:generate`、`db:seed` 脚本。seed 使用 `packages/shared` 的合成 mock data，不写入真实用户数据。

备选方案：

- 等连接 Supabase 后再生成 migration。
- 手写 SQL 但不提供 seed。
- 继续只依赖 mock repository。

理由：

- migration/seed 先落地，可以让下一步数据库验证变成明确操作，而不是重新设计。
- seed 复用合成数据，避免真实隐私数据进入仓库。
- 默认开发仍不依赖数据库，保留 `DATA_REPOSITORY=mock`。

约束：

- 当前 migration/seed 尚未在真实 Supabase dev 数据库执行。
- 执行 `db:migrate` 和 `db:seed` 前必须提供安全的 dev `DATABASE_URL`。

## 2026-05-20：图片录入通过后端上传到 Supabase Storage

背景：录入队列已支持选择图片文件，但早期实现只保存浏览器端文件名、MIME 类型和大小，无法长期保存原始证据，也无法支撑后续 OCR / Vision extraction。

决策：新增 `POST /ingest-items/upload-image`，由 Fastify 后端接收 multipart 图片文件，再使用 Supabase service-role key 上传到私有 bucket `ingest-uploads`。前端不直接访问 service-role key。`ingest_items` 增加 `storageObjectKey`、`fileName`、`mimeType`、`fileSize` 字段，记录可追踪文件元数据。

备选方案：

- 前端直接用 Supabase publishable key 上传。
- 继续只保存图片文件元信息。
- 立即接入 OCR / Vision extraction。

理由：

- service-role key 必须留在服务端，不能进入浏览器。
- 原始图片先归档，后续 OCR、人工预览、证据回溯都有稳定输入。
- 当前只做上传和记录 object key，避免把 Storage、OCR、LLM 解析混在同一刀。

约束：

- bucket 必须保持私有。
- 当前只允许 `image/png`、`image/jpeg`、`image/webp`，单文件限制 20 MB。
- 尚未实现 signed URL 预览、删除策略、OCR 或正式 holdings 写入。

## 2026-05-20：AI extraction 先做规则解析最小闭环

背景：录入队列已经能持久化链接、文本和图片 object key，但如果直接接 OCR / Vision / LLM，会同时引入模型选择、密钥、成本、失败重试和结果版本管理。当前阶段更需要先固定产品闭环和 API 边界。

决策：新增 `POST /ingest-items/:id/extract`，当前使用可替换的规则解析器，从 `source`、`fileName` 和 `rawText` 中识别候选 ticker 与 action，写回 `extractedTicker`、`extractedAction`、`extractedConfidence`、`extractionSummary`、`extractedAt`，并同步更新录入项的 `ticker`、`confidence` 和 `status`。结果仍只进入人工确认队列，不写入正式 holdings。

备选方案：

- 立即接真实 OCR / Vision / LLM。
- 只在前端模拟解析结果。
- 直接把高置信解析结果写入 holdings。

理由：

- 先锁定 extraction 的输入、输出和人工确认流程，后续替换 provider 不需要重做前端和 repository 边界。
- 不直接写正式 holdings，避免未复核内容污染事实表。
- 规则解析器可以覆盖文本类 smoke test，并为图片路径保留 storage object key 边界。

约束：

- 当前不是智能模型能力，只是规则解析最小闭环。
- 图片内容尚未被 OCR / Vision 读取。
- 多次 extraction 会覆盖当前 item 上的候选字段，尚未保留候选结果历史。

## 2026-05-20：图片证据预览使用短期 signed URL

背景：图片已经能上传到私有 Supabase Storage bucket，但人工复核页面无法查看原图，导致截图证据仍不能有效参与确认流程。

决策：新增 `GET /ingest-items/:id/image-url`，后端使用 service-role key 为 `storageObjectKey` 生成 300 秒有效的 signed URL。前端解析预览面板只在截图记录存在 `storageObjectKey` 时显示“生成图片预览”，拿到 signed URL 后展示图片。

备选方案：

- 将 bucket 改成 public。
- 前端直接持有 Supabase key 并生成 URL。
- 先不做预览，等待 OCR / Vision。

理由：

- bucket 保持私有，符合当前隐私边界。
- signed URL 有短期有效期，适合人工复核场景。
- 前端不接触 service-role key。

约束：

- 当前 signed URL 默认 300 秒有效。
- 没有实现下载审计、访问日志、删除策略。
- 预览只解决人工查看图片，不代表已经 OCR 或解析图片内容。

## 2026-05-20：extraction candidates 保留多版本历史

背景：AI extraction 最小闭环已经能把候选 ticker、action 和 confidence 写回 `ingest_items`，但多次解析会覆盖当前字段，无法比较不同 provider、不同时间或不同规则版本的候选结果。

决策：新增 `extraction_candidates` 表和 `GET /ingest-items/:id/extraction-candidates`。每次调用 `POST /ingest-items/:id/extract` 都新增一条候选历史记录，同时继续同步更新 `ingest_items` 上的当前候选字段，保持前端复核流程不变。

备选方案：

- 只保留 `ingest_items` 当前字段。
- 在 `rawText` 里追加解析日志。
- 直接引入完整 workflow/job 表。

理由：

- 多版本候选历史是后续接 OCR、Vision 和 LLM provider 的必要基础。
- 独立表比追加文本更利于查询、对比和审计。
- 当前仍保持一个简单的前端复核入口，不引入复杂任务系统。

约束：

- 当前候选历史只记录 provider、ticker、action、confidence、summary 和创建时间。
- 尚未支持用户选择某个历史候选作为最终接受版本。
- 尚未写正式 holdings。

## 2026-05-20：人工接受后写入正式 holdings / holding_events

背景：录入项已经可以新增、解析、保留候选历史并被人工接受，但接受此前只改变 `ingest_items.status`，没有把确认后的事实写入正式记录表。

决策：新增 `holdings` 和 `holding_events` 表。`POST /ingest-items/:id/accept` 在标记 `已接受` 后，使用当前人工确认字段创建正式 holding 和 holding event。每个 ingest item 只允许生成一条 holding event，重复接受不会重复写事件。

备选方案：

- 继续只改 `ingest_items.status`。
- 直接把 extraction candidate 作为正式 holdings。
- 等完整 holdings 聚合模型设计完成后再写入。

理由：

- Phase 1 需要把“人工确认”推进到可审计事实写入，否则录入闭环仍停在队列层。
- 使用当前 ingest item 字段作为事实来源，明确只有人工接受后的内容进入正式表。
- 最小表结构足以建立 source trace：ingest item -> accepted holding -> holding event。

约束：

- 当前 holdings 模型仍很薄，只记录 ticker、source、lastAction、confidence 和确认状态。
- 尚未支持复杂仓位比例、KOL 维度、快照聚合和冲突合并。
- 前端总览尚未展示真实 accepted holdings。

## 2026-05-21：总览页区分研究信号和正式 accepted holdings

背景：正式 `holdings` / `holding_events` 已经能在人工接受后写入，但总览页仍主要展示 mock consensus signals，用户无法确认哪些记录已经进入正式事实表。

决策：前端新增 `fetchHoldings` 和 `fetchHoldingEvents`，总览页新增“已确认持仓 / Accepted Holdings”面板。原“持仓信号 Tape / Consensus”继续代表研究信号；accepted holdings 面板只展示人工接受后的正式记录。

备选方案：

- 用真实 holdings 替换原 consensus tape。
- 只在录入队列里展示接受状态。
- 新建单独页面展示 accepted holdings。

理由：

- 研究信号和正式事实必须在 UI 上分离，避免把未确认共识误认为事实。
- 在总览页展示正式记录能闭合“录入 -> 接受 -> 正式记录 -> 用户可见”的产品链路。
- 保留原 tape 有助于后续继续展示 KOL 共识和风险信号。

约束：

- 当前 accepted holdings 面板只读展示最近记录。
- 尚未支持点击 accepted holding 回溯到 ingest item、candidate history 或图片证据。

## 2026-05-21：accepted holdings 支持 source trace

状态：该决策的数据/API 能力仍有效；总览页展示位置已被 2026-05-22 的产品减法决策取代。

背景：总览页已经展示正式 accepted holdings，但用户仍需要确认每条正式记录来自哪条录入、哪个候选结果以及原始证据内容。

决策：新增 `GET /ingest-items/:id`，总览页 accepted holdings 表格支持选择记录，并在 Source Trace 面板展示对应 ingest item、raw text、最近候选历史；如果 source 是截图并存在 `storageObjectKey`，复用 signed URL 生成图片预览。

备选方案：

- 跳转到录入队列页查看来源。
- 在 accepted holdings 表格里塞入所有 trace 字段。
- 等完整详情页再做 trace。

理由：

- Source trace 是正式事实表可信度的核心，不应只停留在数据库字段。
- 侧边/底部只读 trace 面板比跳转更适合桌面端高密度工作台。
- 复用现有 ingest item、candidate history 和 signed URL API，避免新建复杂详情模块。

约束：

- 当前 trace 面板只展示最近候选历史，不支持选择历史版本。
- 图片预览路径已实现，但还需要更多图片类 accepted holding 做端到端验证。

## 2026-05-21：DeepSeek 作为文本/链接 extraction provider

背景：当前“AI 解析”已完成产品闭环，但默认实现仍是规则解析。用户后续计划使用 DeepSeek API，因此需要先把 provider 边界接入，而不是把 DeepSeek 调用散落在路由里。

决策：新增 extraction provider 抽象。未配置 `DEEPSEEK_API_KEY` 时使用 `rule_v1`；配置后，文本和链接录入优先调用 DeepSeek OpenAI-compatible chat completions，provider 记录为 `deepseek_text`，失败时回落到 `rule_v1`。截图暂不走 DeepSeek 文本 provider，仍等待 OCR / Vision provider。

备选方案：

- 直接在 `/extract` 路由里调用 DeepSeek。
- 立即强制所有解析依赖 DeepSeek。
- 等图片 OCR 一起实现后再接 DeepSeek。

理由：

- Provider 抽象能保持 `extraction_candidates`、人工确认和 holdings 写入链路不变。
- fallback 避免 API key、网络或模型错误阻塞本地开发。
- DeepSeek 当前适合先处理文本/链接；截图需要额外 OCR/Vision 输入。

约束：

- 真实 DeepSeek 调用需要用户本地配置 `DEEPSEEK_API_KEY`。
- 当前没有把图片二进制交给 DeepSeek；图片解析仍是规则 fallback。
