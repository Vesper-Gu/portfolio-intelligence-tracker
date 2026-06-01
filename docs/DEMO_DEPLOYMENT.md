# Demo 部署说明

最后更新：2026-06-01

## 目标

公开 Demo 用于展示资料录入、人工确认、来源倾向聚合、证据追溯和问答工作流，不处理真实投资资料。

## Demo 边界

- 使用 `DATA_REPOSITORY=mock` 与合成 fixtures。
- 使用 `AUTH_MODE=demo`；每个浏览器匿名会话拥有独立的内存状态。
- 预置多条已确认的合成记录，使首页可直接观察来源 x 标的倾向矩阵。
- 不配置 `DATABASE_URL`、Supabase Storage 或 Vision key。
- 如需展示真实 RAG + LLM 效果，可以配置 `ENABLE_DEMO_RAG_LLM=true` 和后端模型密钥；无 citations、模型失败或 groundedness 校验失败时仍回退模板答案。
- 图片上传在 Demo 界面关闭；文本和链接操作仅在内存中生效。
- 服务重启或休眠唤醒后，用户演示操作可能被重置。

## Render Blueprint

仓库根目录的 `render.yaml` 定义一个 Node Web Service：

```text
Build: VITE_DEMO_MODE=true npm install && VITE_DEMO_MODE=true npm run build
Start: npm run start:demo
Health: /health
```

Render 配置将服务监听地址设为 `0.0.0.0`，并默认打开 `ENABLE_DEMO_RAG_LLM=true`。本地运行同一脚本时保持默认 `127.0.0.1`。在 Render 中选择 New Blueprint，并连接本 GitHub 仓库即可创建演示服务；如果要让问资料库显示 `LLM+资料库`，还需要在 Render 后端环境变量中配置 `RAG_LLM_API_KEY` 或 `DEEPSEEK_API_KEY`。

## 验证清单

- `/health` 返回服务正常状态。
- 首页显示多标的合成来源倾向矩阵。
- 配置模型密钥后，问资料库在有证据命中时显示 `LLM+资料库`。
- 录入页的图片入口不可用，文本与链接仍可进入复核队列。
- 在一个浏览器中新增记录，不会出现在另一个浏览器匿名会话中。
- 页面及 API 返回不暴露 Storage object path 或密钥。

## 正式产品边界

允许用户上传真实截图或保存真实研究记录前，必须改用 `AUTH_MODE=external`、私有持久化存储、已验证的 RLS、可审计限额与正式隐私政策。公开 Demo 不能替代这些要求。
