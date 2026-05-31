# 私有 Beta 部署说明

最后更新：2026-06-01

## 目标

私有 Beta 用于单个授权用户保存真实研究资料、上传截图并查询个人资料库。它与公开 Demo 分开部署，不使用匿名内存数据。

## 运行边界

- 使用 `AUTH_MODE=external`，所有资料接口要求 Supabase 登录令牌。
- 使用 `DATA_REPOSITORY=database`，研究资料持久化到 Supabase PostgreSQL。
- Render 等 IPv4 运行环境的 `DATABASE_URL` 必须使用 Supabase Session Pooler 连接地址，而不是默认 IPv6 direct connection。
- 截图只存入私有 `ingest-uploads` bucket，界面通过短期 signed URL 预览。
- 模型 key 只配置在 Render 服务端；前端只使用 Supabase publishable key。
- 问答层只允许基于当前账户检索到的资料作答，不提供资料库以外的市场事实或投资建议。

## Render 服务

仓库根目录的 `render.beta.yaml` 定义独立 Beta 服务：

```text
Build:  npm install && npm run build
Start:  npm run start:beta
Health: /health
```

部署时必须在 Render Secret 环境变量中填写：

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

如启用模型解析和自然语言回答，再填写：

```text
DEEPSEEK_API_KEY
RAG_LLM_API_KEY
MOONSHOT_API_KEY
```

`VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 会进入浏览器构建产物，只能填写 Supabase 允许公开的 URL 与 publishable/anon key，不能填写 service-role key。

## 上线前验证

1. 执行全部数据库 migrations，并确认资料表已启用 RLS。
2. 确认 `ingest-uploads` 为私有 bucket，限制文件大小和图片 MIME 类型。
3. 建立授权登录账户，关闭不需要的公共注册入口。
4. 以已登录账户验证文本录入、截图上传、图片预览、人工确认、资料库查询、导出和删除。
5. 使用未登录窗口验证业务 API 返回 `401`，不能读取资料。
6. 检查 Render 日志不输出模型 key、signed URL 或原始资料内容。

## 当前成本控制

Beta 默认将截图上限限制为 `10 MB`，每日 extraction 限额为 `20`，RAG 查询限额为 `100`。额度计量保存在 `daily_capability_usage`，通过原子预占避免并发请求绕过上限，服务重启后不会清零。解析、上传和问答会向 `capability_traces` 写入脱敏运行轨迹，包括 skill、provider、版本、有限重试次数和粗粒度估算成本；扩大用户范围前仍需接入告警和供应商账单对账。
