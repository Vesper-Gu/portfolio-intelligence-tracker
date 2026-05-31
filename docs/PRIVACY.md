# 隐私说明

最后更新：2026-06-01

## 当前定位

当前实现已具备认证接入口、服务端 `user_id` 隔离、Supabase RLS migration、对象存储用户分区和账户删除链路。正式公开上线仍需在部署环境执行 migration、配置 Supabase Auth/RLS 与验证备份、审计和隐私政策发布流程。

## 会存储什么

- 用户录入的链接、文本和截图元数据。
- 上传截图的原始文件，存入私有 Supabase Storage bucket。
- AI 解析候选、人工修改后的字段、已加入资料库的 holdings 和 holding events。
- 质量事件、配置变更和归档/恢复记录。
- 模型能力的脱敏运行 trace 与每日使用量。trace 不保存原始正文、图片、prompt、signed URL 或密钥。

## 会发送给谁

- 未点击 AI 解析时，文本和图片只进入本项目后端与数据库/存储。
- 启用 DeepSeek 文本解析时，相关文本会发送给配置的 DeepSeek-compatible API。
- 启用 Kimi Vision 时，截图内容会发送给配置的 Moonshot/Kimi-compatible API。
- 启用 RAG LLM 时，系统只发送检索命中的资料库上下文和问题，不发送完整数据库。
- 启用 pgvector 混合检索时，系统只向 embedding provider 发送结构化过滤后的候选文档；生成的 embedding 和文档索引按 `user_id` 隔离存储，并随账户删除清理。
- Storage object path、上传字节数和 reviewer note 等运维元数据只用于后端处理，不作为问答或解析提示词内容发送给模型服务商。

## 不会做什么

- 不在浏览器端保存 LLM API key、Supabase service role key 或数据库密码。
- 问资料库不允许补充资料库以外的实时行情、外部事实或投资建议。
- 不应把真实私有截图、真实 portfolio export 或 `.env` 提交到仓库。

## 删除与导出

设置页提供：

- 导出资料库 JSON。
- 删除当前用户范围内的录入、候选、持仓、事件和质量记录。

删除接口会先删除当前用户关联的对象存储文件，再清理当前用户范围内的数据库记录；若文件删除失败，数据库记录保留以便重试与追查。

## 上线前要求

- 在生产环境启用 `AUTH_MODE=external` 并配置 Supabase Auth。
- 执行包含 RLS 的 multi-user migration，并做双账户越权测试。
- 校验 Storage bucket 为私有，并限制服务端 service role key 暴露范围。
- 验证删除、导出、备份保留期与操作审计日志。
- 为持久化用量和 capability trace 接入告警与成本看板。
- 发布隐私政策，说明第三方模型服务的数据处理边界。
