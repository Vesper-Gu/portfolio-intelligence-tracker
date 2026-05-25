# 隐私说明

最后更新：2026-05-25

## 当前定位

当前实现已具备认证接入口、服务端 `user_id` 隔离、Supabase RLS migration、对象存储用户分区和账户删除链路。正式公开上线仍需在部署环境执行 migration、配置 Supabase Auth/RLS 与验证备份、审计和隐私政策发布流程。

## 会存储什么

- 用户录入的链接、文本和截图元数据。
- 上传截图的原始文件，存入私有 Supabase Storage bucket。
- AI 解析候选、人工修改后的字段、已加入资料库的 holdings 和 holding events。
- 质量事件、配置变更和归档/恢复记录。

## 会发送给谁

- 未点击 AI 解析时，文本和图片只进入本项目后端与数据库/存储。
- 启用 DeepSeek 文本解析时，相关文本会发送给配置的 DeepSeek-compatible API。
- 启用 Kimi Vision 时，截图内容会发送给配置的 Moonshot/Kimi-compatible API。
- 启用 RAG LLM 时，系统只发送检索命中的资料库上下文和问题，不发送完整数据库。

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
- 将当前进程内的用量保护额度升级为跨实例可审计的持久化计量和告警。
- 发布隐私政策，说明第三方模型服务的数据处理边界。
