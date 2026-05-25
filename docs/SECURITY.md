# 安全说明

本文件补充根目录 `SECURITY.md`，用于把项目设置阶段的安全约定放在产品文档附近。

## 当前风险级别

代码仓库可公开展示，但实际部署会处理研究备注、截图、账号 handle 和 API key。用户资料与运行配置必须始终按私有数据处理。

## Secret 规则

禁止提交：

- 带真实值的 `.env` 文件。
- Anthropic、OpenAI、Supabase、GitHub 或部署平台 token。
- Supabase service-role key。
- 私钥、证书、OAuth secret 或数据库密码。
- 真实私有截图或真实 portfolio export。

允许提交：

- 只含占位值的 `.env.example`。
- 合成 seed data。
- localhost URL。

## 数据处理

- 测试和 demo 使用合成数据。
- 原始截图功能实现后，只能存入私有 storage bucket。
- Storage object path 不得进入用户可见聚合结果或第三方模型提示词；模型层仅接收必要的证据内容和脱敏来源标签。
- 保留 source text 以支持追溯，但避免保存不必要的个人或私密信息。
- failed extraction 示例默认保持私有，公开前必须脱敏。
- 产品层隐私说明见 `docs/PRIVACY.md`。

## 前端边界

前端代码只能使用供应商明确允许公开的 public / anonymous key。service-role key、LLM API key 和高权限数据库凭证必须留在服务端。

## 数据库凭证

- `DATABASE_URL` 只能用于 `apps/api` 服务端环境。
- `SUPABASE_SERVICE_ROLE_KEY` 只能用于后端受控任务，不能放入 `apps/web/.env` 或任何 `VITE_*` 变量。
- 默认开发模式必须保持 `DATA_REPOSITORY=mock`，避免无意连接真实数据库。
- 使用 `DATA_REPOSITORY=database` 前，必须确认 `.env` 不会提交，且数据库是 dev project 而不是生产库。

## 发布前检查

推送或公开前运行：

```bash
git status --short
git ls-files
git grep -n -E "(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY)"
npm run typecheck
npm run test
npm run build
```

同时检查 `docs/PUBLISHING_CHECKLIST.md`。
