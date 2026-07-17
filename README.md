# SolveField · 物理竞赛试题 Wiki 分享社区

面向全球物理竞赛爱好者的开源题库 Wiki 社区：可分类查阅、用户评分点赞、Wiki 式提交修改、中英多语言、原生 LaTeX 公式渲染、完整管理员后台。

- **正式域名**：https://solvefield.playphysics.net （子域名，根路径部署）
- **仓库**：Ben-noncodingceo/SolveField
- **部署**：GitHub → Cloudflare 自动部署（不依赖任何本机在线）

## 主要功能

- 📚 **试题分类检索**：按年份 / 竞赛（CPhO·IPhO·APhO）/ 级别（国家·区域·世界）/ 难度 1–5 / 知识点标签 组合筛选，按点赞·评分排序。
- ⭐ **评分点赞**：点赞/点踩 + 1–5 星评分，自动统计平均分与人数，单用户单题唯一记录防刷。
- 📝 **Wiki 修改机制**：普通用户不能直改原题，只能提交修改建议（题干/答案/公式/补充）；管理员审核，通过则覆盖并留版本历史，驳回附理由，全程留痕。
- 🌏 **中英多语言**：UI 随语言切换；题目保留原始语言 + 中文 + 英文三份，切换只改优先展示、不覆盖原文。
- 🧮 **原生 LaTeX 渲染**：题干/解析/答案用 KaTeX 自动渲染（行内/独立/多行/矩阵/积分/矢量/方程组），后台实时预览，移动端自适应，不用图片公式。
- 🛠 **管理员后台**：user/editor/admin 权限体系，题目/分类/用户/提案管理，草稿-发布-归档，版本历史。

## 技术栈（固定，禁止变更）

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15 (App Router) + Payload CMS 3.82 |
| 语言 | TypeScript 严格模式 |
| 数据库 | Cloudflare D1（`@payloadcms/db-d1-sqlite`，beta） |
| 文件存储 | Cloudflare R2（`@payloadcms/storage-r2`） |
| 缓存/配置 | Cloudflare KV（Phase 1+ 接入） |
| 部署 | Cloudflare Workers（`@opennextjs/cloudflare`）+ Pages 静态资源 |
| 公式 | KaTeX（全局，SSR 优先） |
| 国际化 | next-intl（Phase 2 接入） |

底座采用 Payload 官方模板 `with-cloudflare-d1`。可行性结论与修正记录见 [`docs/ADR-001-cloudflare.md`](docs/ADR-001-cloudflare.md)。

## 分阶段开发路线（每阶段可独立运行/部署/验收）

- **Phase 0 · 技术可行性探针** ✅ *（当前已完成）* — 最小 Payload+CF 骨架，验证 D1/R2/构建/Worker 打包，产出 ADR。
- **Phase 1 · 数据模型 + 权限** — 5 张 Collection（Competitions/Problems/ProblemEdits/ProblemRatings/Users）+ Media；user/editor/admin 权限；migration/seed。
- **Phase 2 · 中英双语 + KaTeX** — next-intl；题目三语分离存储；KaTeX SSR 渲染 + 后台预览。
- **Phase 3 · 题库门户 + 筛选** — 列表/详情/分页；多条件组合筛选进 URL；D1 索引。
- **Phase 4 · 点赞评分** — 唯一记录防刷；原子更新统计；KV 限流/缓存。
- **Phase 5 · Wiki 提案闭环** — 提交→审核→通过更新+版本 / 驳回附理由；审计快照。
- **Phase 6 · Cloudflare 生产化** — 正式 binding、Preview/Prod 隔离、迁移/回滚/备份。
- **Phase 7 · 门户完善 + 上线验收** — 用户中心、响应式、SEO、回归、上线。

分工：**开发** David · **测试/运营** Olivia · **规划/门禁** Cindy · **内容（标签/难度/KaTeX/seed）** Ted。

## 仓库中的共享真相文件

- [`README.md`](README.md) — 本文件（每次开发必须同步更新）
- [`docs/ADR-001-cloudflare.md`](docs/ADR-001-cloudflare.md) — 架构决策与可行性
- [`TEST_MATRIX.md`](TEST_MATRIX.md) — 分阶段验收矩阵（Olivia 维护）
- [`content/`](content/) — 内容规范与 seed（Ted 维护）：`tags-taxonomy.json` / `difficulty-rubric.md` / `katex-authoring.md` / `seed.json` / `seed.schema.json`

## 本地运行

```bash
pnpm install
cp .env.example .env      # 填 PAYLOAD_SECRET，例如：openssl rand -hex 24
pnpm dev                  # http://localhost:3000  （/admin 进后台）
```

## 构建与测试

```bash
pnpm build                          # next build（编译 + 类型检查 + 静态生成）
npx opennextjs-cloudflare build     # 打包成 Cloudflare Worker（.open-next/worker.js）
pnpm lint                           # ESLint
pnpm test                           # vitest（集成）+ playwright（e2e）
```

> 本地无需登录 Cloudflare 也能构建：无 `CLOUDFLARE_API_TOKEN` 时自动用本地 wrangler 代理提供本地 D1/R2。

## Cloudflare 部署

走 **GitHub → Cloudflare 自动部署**（推荐，不依赖本机）：

1. 在 Cloudflare（GitHub `Ben-noncodingceo` 绑定账号）创建 D1 数据库、R2 桶，把 `wrangler.jsonc` 里的 `database_id` 填上。
2. 连接 GitHub 仓库到 Cloudflare Workers/Pages，绑定 D1(`D1`)、R2(`R2`)、（后续）KV。
3. 设置 secret：`PAYLOAD_SECRET`（勿入库、勿发公开频道）。
4. **数据库迁移（首次上线前必须做，否则 D1 无表、站点起不来）**：部署命令用 `pnpm run deploy`（含 `payload migrate`），并在构建环境注入 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`；或首次先手动跑一次 `pnpm run deploy:database`。详见 ADR 风险 §6。
5. **生产 seed（首次初始化按需执行）**：在相同 Cloudflare 凭据环境中运行 `pnpm run seed:remote`。该命令从 `content/seed.json` 生成有序幂等 SQL，使用原生 `wrangler d1 execute --remote --file` 写入，然后以独立 D1 JSON 查询逐 slug 校验 1 个竞赛 + 3 道题；Wrangler、JSON 或计数任一失败均非零退出。它不使用生产中已证实会提前 exit 0 的 Payload remote proxy。日常部署不会自动重放 seed，避免覆盖管理员后续编辑。
6. push `main` → Production；PR/分支 → Preview。
7. 绑定自定义域名 `solvefield.playphysics.net`。

细节与已知限制（sharp 不可用、admin 包体积、D1 beta 等）见 ADR。

---

## 开发状态

> 详见 [`STATUS.md`](STATUS.md)。

- **当前阶段**：Phase 1 ✅ 代码完成（数据与权限底座），待 Olivia 生产验收。
- **Phase 1 本次变更**：新增 5 张核心 Collection（Competitions/Problems/ProblemRatings/ProblemEdits/Users 角色化）+ 保留 Media；字段对齐 `content/seed.schema.json`（补 totalDislikes/source/originalLanguage/三语/审计字段）；user/editor/admin 权限（访客只读 published、用户不能直改题、Users 目录仅 admin 可见且 user/editor 只读自己）；`(problem,user)` DB 级复合唯一；tags 值域派生自 `content/tags-taxonomy.json`；加 KV binding；生成迁移 `20260717_045649_phase1_collections`；幂等 seed（本地 `pnpm seed`、生产 `pnpm run seed:remote`，均带结果校验）；`push:false` 走迁移模式。本地 tsc/build/迁移/seed/`check:phase1` 全绿。
- **构建期 D1 隔离**：`pnpm build` 与 OpenNext build 设置 `SOLVEFIELD_EPHEMERAL_PROXY=1`，使并行 page-data worker 使用不落盘的 Miniflare bindings，避免共享 `.wrangler/state` 的 SQLite 锁/只读竞争；本地 dev 与 Payload CLI 仍使用持久化 D1。
- **Phase 1 下一步**：合并 main → Olivia 用 D1 权限 token 部署（应用新迁移）+ 验权限/唯一约束/seed → 通过后 Cindy 开 Phase 2。需账号侧：D1 权限 token、KV namespace id、确认 CF 自动部署。

### 历史
- **Phase 0** ✅ 完成（技术探针通过，可行）。
- **本次变更**：用 Payload 官方 `with-cloudflare-d1` 模板初始化骨架；修复 4 处模板/版本漂移（CSS 类型声明、`generatePayloadViewport`、`storage→plugins`、`build` 脚本）+ 离线可构建改造；`next build` 与 OpenNext Worker 打包全绿；纳入 `TEST_MATRIX.md` 与 `content/` 共享真相；产出 `docs/ADR-001-cloudflare.md`。域名定为 `solvefield.playphysics.net`（子域名，无 basePath）。
- **已配**：D1 数据库 `solvefield`（id `392ee4ac-87e8-46e4-a25b-283abdbb2e2f`）与 R2 桶 `solvefield` 已建，D1 id 已填入 `wrangler.jsonc`；账号侧已连 GitHub + 绑定 + secret + 域名。
- **修复中（生产 500）**：首次部署后所有服务端路由 500，根因是运行时上下文判据用了构建期变量 `CLOUDFLARE_API_TOKEN`，导致 Worker 运行时误加载 `wrangler` → `No such module "wrangler"`。已改为按 `navigator.userAgent === 'Cloudflare-Workers'` 判运行时（Worker 走原生 binding，绝不加载 wrangler）。详见 ADR 事故记录。
- **下一步**：合并 main → Olivia 用 token 重部署 + `wrangler tail` 复验 500 消失 + 确认迁移已应用 → 通过后 Olivia 跑 D1–D9/U1–U8，Cindy 再开 Phase 1。
