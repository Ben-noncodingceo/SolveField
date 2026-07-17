# SolveField 开发状态

> 简明进度追踪（共享真相之一）。每阶段更新：当前阶段 / 本次变更 / 门禁 / 下一步。

## 当前阶段：Phase 1 ✅；Phase 1A 代码 + 本地 E2E ✅，待 Preview/生产验收

### 已完成
- **Phase 1A 隔离暂存**：`IngestionJobs` / `IngestionItems` / `IngestionAssets`，审核前 `createdProblem=null`，未审资源仅使用私有 `ingestion/` R2 key。
- **受限凭证**：`IngestionTokens` 只存 SHA-256 hash，支持 scope/过期/禁用/轮换；Agent 只有 ingestion create/update/read-own，publish/approve/用户管理均 403。
- **入库 API**：`POST /api/ingestion/jobs` 不信任客户端 validation，独立重算 schema、PDF 字节/页数/hash、bundle/content/idempotency、taxonomy、page/bbox/marker、confidence 与 KaTeX；error → 422 不落库，warning → needs-review。
- **重复/版本**：同 idempotency 返回原草稿；同身份同 hash 同版；同身份异 hash 建 revision；同 hash 异身份和 ≥0.92 文本候选只 warning，绝不自动合并。
- **人工审核事务**：`POST /api/ingestion/jobs/:id/approve` 仅 Payload admin 会话；重读私有 R2 并重验，事务内创建/更新 Competition/Media/Problem，记录原输入、Agent 输出、人工 diff、审核人与时间。
- **契约/迁移**：Ted 冻结的 schema/contract/example/checklist 已归档到 `docs/ingestion-v1/`；迁移 `20260717_074705` up/down 本地往返通过。
- **5 张核心 Collection**：`Competitions`、`Problems`、`ProblemRatings`、`ProblemEdits`、`Users`（+ 保留 `Media`/R2）。
- **字段对齐** `content/seed.schema.json`；补齐：`Problems.totalDislikes`、`source`、`originalLanguage`、三语题干/解析；`ProblemRatings` 的 `(problem,user)` 复合唯一 + `vote(-1/0/1)`/`score(1-5)`；`ProblemEdits` 的 before/after 快照、reviewedBy/At、rejectReason、targetVersion。
- **权限**：访客只读 `published`；user 可评分/提案但**不能直改 Problems**；editor 审提案/改题；admin 全权。role 字段仅 admin 可改（防提权）。Users 目录仅 admin 可读全部，user/editor 只读自己，未登录不可读。
- **标签**：`Problems.tags` 值域从 `content/tags-taxonomy.json` 派生（单一来源，防漂移）。
- **KV binding**：已在 `wrangler.jsonc` 加 `KV`（本阶段不做业务缓存；namespace id 待建，见下）。
- **迁移**：`src/migrations/20260717_045649_phase1_collections`（含 `(problem_id,user_id)` DB 级唯一索引）。
- **seed 导入**：本地 `pnpm seed` 使用 Payload importer；生产 `pnpm run seed:remote` 从同一 `content/seed.json` 生成幂等 SQL，经原生 Wrangler D1 写入，再独立 JSON 查询逐 slug 验证。不使用远程会提前 exit 0 的 Payload proxy；Wrangler/解析/计数失败均非零退出。
- **DB 采用 migration 模式**：`sqliteD1Adapter({ push: false })`。
- **构建期代理隔离**：Next/OpenNext build 显式 `SOLVEFIELD_EPHEMERAL_PROXY=1` → `getPlatformProxy({ persist:false })`，防止并行 page-data worker 争用同一 Miniflare SQLite；dev/CLI 继续持久化。
- **部署编排**：`deploy:app` / `deploy:database` 通过 Node 构造可选 Cloudflare env 参数；空环境不传 `--env`。app 部署还要求前后版本列表出现新 Worker version，否则 exit 1，防止 OpenNext wrapper no-op 假绿。

### 门禁结果（本地）
| 项 | 结果 |
|---|---|
| strict `tsc --noEmit` | ✅ 0 error |
| `next build` | ✅ 全绿 |
| 本地 D1 迁移应用 | ✅ 两个迁移成功 |
| `pnpm seed` | ✅ 1 竞赛 + 3 题（IPhO 2026 T1–T3），幂等 |
| `pnpm run check:phase1` | ✅ seed 存在 / role 默认 / **(problem,user) 唯一约束拦截重复** |
| ingest v1 契约 Vitest | ✅ 6/6（含冻结 JCS contentHash 精确复现） |
| ingest v1 真实 HTTP + D1/R2 Playwright | ✅ 5/5 |
| `20260717_074705` migrate down/up | ✅ 往返通过 |

### 待账号侧 / Olivia（不阻断代码，但 Phase 1 生产验收需要）
1. **D1 权限的 token**：跑新迁移建表与生产 seed 需 D1+Workers+R2 Edit 的 token（配进 CF 自动构建，或给 Olivia 手动运行 `pnpm run deploy:database` + `pnpm run seed:remote`）。
2. ✅ **KV namespace**：`solvefield-kv` 已建，id `58d8b249448641bf970b393ceb124fe3` 已填入 `wrangler.jsonc`（Phase 4 才真正用）。
3. **GitHub→CF 自动部署**：确认 Workers Builds 自动触发（Phase 0 遗留）。

### 下一步
1. Olivia 部署新迁移，验证生产 Worker 的 ingestion 路由和 D1/R2 binding。
2. 使用私密测试 token 执行 Ted 清单：422 不落库、幂等、三图待审、越权 403、admin-only 发布与审计。
3. Phase 1A 关门后按路线进入 Phase 1.1 邮箱注册 / Phase 2 双语 + KaTeX 垂直切片。

## 历史
- **Phase 0** ✅ 技术探针通过（Payload+CF 可行）；生产 500（wrangler 运行时 import）已修，站点上线 https://solvefield.playphysics.net。详见 `docs/ADR-001-cloudflare.md`。
