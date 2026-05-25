# Security Policy

Portfolio Intelligence Tracker 处理可能敏感的研究截图、笔记和账号资料。公开仓库仅应包含代码、占位配置和合成演示数据。

## 禁止提交

- `.env` 或任何含真实值的环境配置。
- API key、service-role key、数据库口令、私钥、access token 或 signed URL。
- 真实用户截图、原始上传文件、资料导出、账号 handle 或可关联个人研究行为的验证日志。
- 生产数据库或对象存储导出文件。

## 应用安全边界

- 浏览器只使用匿名认证配置；`SUPABASE_SERVICE_ROLE_KEY` 和模型 API key 只能存放在 API 服务端。
- 生产模式应启用 `AUTH_MODE=external`、数据库 RLS 与按 `user_id` 隔离的数据访问。
- 上传图片应使用私有 Storage bucket 和短期 signed URL；不得公开 bucket 或将签名 URL 写入日志。
- RAG/LLM 仅允许基于用户已存资料回答，不得扩展为外部投资建议。
- 若启用 Vision 或 LLM，部署者必须告知用户资料会被发送到相应模型服务商处理。

## 发布前检查

```bash
git status --short
git ls-files
git grep -n -E "(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY)"
npm run typecheck
npm run test
npm run build
```

同时人工确认 staged files 中不存在真实截图、导出文件、编辑器交换文件和本地验证记录。

## GitHub 设置

- 启用 secret scanning 与 push protection。
- 启用 Dependabot security updates 和 vulnerability alerts。
- 对 `main` 启用分支保护并要求 CI 通过后合并。
- 将生产 secrets 存放在部署平台 secret manager，而不是 GitHub 仓库文件中。

## 报告问题

不要在公开 Issue 中提交密钥、截图或用户数据。请通过 GitHub 私密漏洞报告功能提交安全问题。

若密钥曾被提交，必须先在上游 provider 立即轮换或吊销，再处理 Git 历史清理。
