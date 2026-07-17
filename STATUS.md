# SolveField 开发状态

> 简明进度追踪（共享真相之一）。每阶段更新：当前阶段 / 本次变更 / 门禁 / 下一步。

## 当前阶段：Phase 1 — 数据与权限底座 ✅（代码完成，待 Olivia 生产验收）

### 已完成
- **5 张核心 Collection**：`Competitions`、`Problems`、`ProblemRatings`、`ProblemEdits`、`Users`（+ 保留 `Media`/R2）。
- **字段对齐** `content/seed.schema.json`；补齐：`Problems.totalDislikes`、`source`、`originalLanguage`、三语题干/解析；`ProblemRatings` 的 `(problem,user)` 复合唯一 + `vote(-1/0/1)`/`score(1-5)`；`ProblemEdits` 的 before/after 快照、reviewedBy/At、rejectReason、targetVersion。
- **权限**：访客只读 `published`；user 可评分/提案但**不能直改 Problems**；editor 审提案/改题；admin 全权。role 字段仅 admin 可改（防提权）。Users 目录仅 admin 可读全部，user/editor 只读自己，未登录不可读。
- **标签**：`Problems.tags` 值域从 `content/tags-taxonomy.json` 派生（单一来源，防漂移）。
- **KV binding**：已在 `wrangler.jsonc` 加 `KV`（本阶段不做业务缓存；namespace id 待建，见下）。
- **迁移**：`src/migrations/20260717_045649_phase1_collections`（含 `(problem_id,user_id)` DB 级唯一索引）。
- **seed 导入**：本地 `pnpm seed` 使用 Payload importer；生产 `pnpm run seed:remote` 从同一 `content/seed.json` 生成幂等 SQL，经原生 Wrangler D1 写入，再独立 JSON 查询逐 slug 验证。不使用远程会提前 exit 0 的 Payload proxy；Wrangler/解析/计数失败均非零退出。
- **DB 采用 migration 模式**：`sqliteD1Adapter({ push: false })`。
- **构建期代理隔离**：Next/OpenNext build 显式 `SOLVEFIELD_EPHEMERAL_PROXY=1` → `getPlatformProxy({ persist:false })`，防止并行 page-data worker 争用同一 Miniflare SQLite；dev/CLI 继续持久化。

### 门禁结果（本地）
| 项 | 结果 |
|---|---|
| strict `tsc --noEmit` | ✅ 0 error |
| `next build` | ✅ 全绿 |
| 本地 D1 迁移应用 | ✅ 两个迁移成功 |
| `pnpm seed` | ✅ 1 竞赛 + 3 题（IPhO 2026 T1–T3），幂等 |
| `pnpm run check:phase1` | ✅ seed 存在 / role 默认 / **(problem,user) 唯一约束拦截重复** |

### 待账号侧 / Olivia（不阻断代码，但 Phase 1 生产验收需要）
1. **D1 权限的 token**：跑新迁移建表与生产 seed 需 D1+Workers+R2 Edit 的 token（配进 CF 自动构建，或给 Olivia 手动运行 `pnpm run deploy:database` + `pnpm run seed:remote`）。
2. ✅ **KV namespace**：`solvefield-kv` 已建，id `58d8b249448641bf970b393ceb124fe3` 已填入 `wrangler.jsonc`（Phase 4 才真正用）。
3. **GitHub→CF 自动部署**：确认 Workers Builds 自动触发（Phase 0 遗留）。

### 下一步
合并 main → Olivia 用 D1 token 部署（应用新迁移）+ 按 TEST_MATRIX 验权限/唯一约束/seed → 通过后 Cindy 开 Phase 2（i18n + KaTeX 前台）。

## 历史
- **Phase 0** ✅ 技术探针通过（Payload+CF 可行）；生产 500（wrangler 运行时 import）已修，站点上线 https://solvefield.playphysics.net。详见 `docs/ADR-001-cloudflare.md`。
