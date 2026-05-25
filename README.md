# Portfolio Intelligence Tracker

财经持仓追踪系统。当前阶段先建设可长期维护的后端基础设施，支撑前端从假数据切换到真实 API。

## 当前边界

- 已包含：KOL/来源管理、持仓记录、快照与变动事件、录入确认队列、标的矩阵聚合、提醒规则、数据质量指标。
- 暂不包含：RAG 检索、embedding pipeline、LLM answer synthesis。RAG 由独立模块接入，本仓库只保留清晰边界。

## 目录

```text
backend/
  src/
    domain/       领域模型与校验
    repositories/ 数据访问接口与内存实现
    services/     用例层
    http/         HTTP 路由
  supabase/
    migrations/   Supabase SQL migration
    seed/         本地/开发种子数据
```

## 本地运行

```bash
cd backend
npm test
npm run dev
```

默认服务地址：`http://localhost:4317`。

## API 约定

- 所有响应都是 JSON。
- 成功响应：`{ "data": ... }`
- 失败响应：`{ "error": { "code": "...", "message": "..." } }`
- RAG 相关 API 不在当前后端实现，后续通过独立服务或模块挂载。

## Git 约定

- 每个可验证功能一组提交。
- migration、API、测试必须一起提交，避免 schema 与接口漂移。
- 不把 `.env`、真实截图、真实账户 API key 或用户私有数据提交进仓库。

