# ADR-001: Payload CMS on Cloudflare — 可行性结论

- 状态：**已接受（探针通过）**
- 阶段：Phase 0 技术可行性探针（task #25）
- 日期：2026-07-17
- 决策人：David（开发）；验收：Olivia（运维）；规划：Cindy

## 结论（TL;DR）

**可行 ✅。** 用户要求的技术栈（Payload CMS + Next.js + Cloudflare Pages/Workers + D1 + R2 + KV + 全量 TS）经本机实测**可以构建并打包成 Cloudflare Worker**。已验证：依赖安装、`next build`（编译+类型检查+静态生成）全绿、OpenNext 打包出 `.open-next/worker.js`。

基础不是从零手搭，而是采用 Payload 官方模板 **`with-cloudflare-d1`**，它开箱即用了正是本项目要求的组合：
- `@payloadcms/db-d1-sqlite`（Cloudflare D1，beta）
- `@payloadcms/storage-r2`（R2 存储）
- `@opennextjs/cloudflare`（把 Next.js 打包成 Worker）
- Next.js 15.4 + React 19 + Payload 3.82.1 + 严格 TS

## 验证过的命令（可复现）

```bash
pnpm install                       # ✅ 依赖解析 ~55s
cp .env.example .env               # 填入 PAYLOAD_SECRET（openssl rand -hex 24）
pnpm build                         # ✅ next build 全绿（编译+类型+静态生成）
npx opennextjs-cloudflare build    # ✅ 产出 .open-next/worker.js（Worker 打包成功）
pnpm dev                           # 本地开发（getPlatformProxy 提供本地 D1/R2）
```

> 环境：Node 25.8.2 / pnpm 10.33 / wrangler 4.111。

## 采用官方模板后需要的修正（模板与 3.82.1 版本漂移）

官方模板代码取自 payload 仓库 HEAD，而依赖锁在 3.82.1，两者有 4 处漂移，均已修复（否则构建失败）：

1. **CSS 侧效应导入无类型**：严格 TS 下 `import './styles.css'` / `@payloadcms/next/css` 报 "Cannot find module"。
   → 新增 `globals.d.ts`：`declare module '*.css' / '*.scss' / '@payloadcms/next/css'`。
2. **`generatePayloadViewport` 不存在**：`(payload)/layout.tsx` 引用了 3.82.1 未导出的符号（layouts 仅导出 `metadata / RootLayout / handleServerFunctions`）。
   → 移除该 import 与 `export const generateViewport`。
3. **顶层 `storage` 键不存在**：Payload 3.x 存储适配器走 `plugins`，模板用的顶层 `storage:[]` 是更新的 API。
   → `storage:[r2Storage(...)]` 改为 `plugins:[r2Storage(...)]`。
4. **`build` 脚本用了失效命令**：`payload build` 在 3.82.1 不存在（OpenNext 内部调 `pnpm build` 因此失败）。
   → `package.json` 的 `build` 改为 `next build`。

另外一处**主动改进**（非修 bug）：
- **离线可构建**：模板在生产构建时用 OpenNext 远程上下文 `getCloudflareContext()`，需要 Cloudflare 凭证（`CLOUDFLARE_API_TOKEN`），否则构建在"收集页面数据"阶段因远程 binding 401 失败。改为**仅当存在 `CLOUDFLARE_API_TOKEN` 时才用远程上下文，否则回退到本地 wrangler 代理**（本地 D1/R2）。效果：本地 `pnpm build` 无需登录 Cloudflare 也能全绿；CI（GitHub→Cloudflare，带 token）自动用远程 binding。保证 `main` 本地与 CI 都可构建。

## 已知风险 / 限制（务必周知）

1. **D1 适配器为 beta**：`@payloadcms/db-d1-sqlite` 官方标注 beta，可能有 breaking change。锁版本、升级前先在分支验证。
2. **admin 后台包体积较大**：`/admin` First Load JS ≈ **562 kB**（Payload 后台本身重）。前台首页仅 ~107 kB，不受影响；后台仅管理员用，可接受，但要注意 Worker 包体上限。
3. **图片处理 `sharp` 在 Workers 不可用**：Payload 默认用 sharp 做图片缩放/裁剪，Workers 无该原生能力。本模板不启用 sharp（上传走 R2 存原图）。若后续要自动生成缩略图，需用 Cloudflare Images 或按需在边缘处理，不能依赖 sharp。
4. **构建需要 Cloudflare 上下文**：Payload 配置在构建期解析 D1 binding。生产构建要么在 CF CI 环境跑（推荐），要么本地带 `CLOUDFLARE_API_TOKEN`；无 token 时用本地 binding（已处理，见上）。
5. **KV 尚未接入**：模板含 D1+R2，未含 KV。本项目 spec 要求 KV（限流/缓存），Phase 1+ 时在 `wrangler.jsonc` 加 KV namespace binding + `getCloudflareContext().env.KV` 使用即可（低风险，标准 binding）。
6. **⚠️ D1 迁移不会随 `deploy:app` 自动跑（首次上线前必须解决）**：`deploy:app` 只打包+部署 Worker，建表迁移在 `deploy:database`（`payload migrate`）。若不专门执行，D1 里没有表，应用运行时报错、站点起不来。方案（Phase 6 生产化落地，但首次部署前必须定）：
   - **推荐**：GitHub→Cloudflare 的部署命令用 `pnpm run deploy`（= `deploy:database` 迁移 + `deploy:app`），并在构建环境注入 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`，让 `payload migrate` 能连远程 D1。
   - **首次替代**：先本地/手动带 token 跑一次 `pnpm run deploy:database`（迁移），之后再交给 CI 自动迁移。
   - migration 文件在 `src/migrations/`（Payload 管理），新增字段后用 `payload migrate:create` 生成、随代码提交。

## 部署决策

- **目标域名（用户最终确认，方案 A 子域名）**：**https://solvefield.playphysics.net**
  - 根路径部署，`/admin`、`/api`、静态资源均在根下，**不需要 basePath**（避免了 Payload-on-CF 的 basePath 适配坑）。
- **部署链路**：**GitHub `Ben-noncodingceo/SolveField` → Cloudflare 自动部署**（Pages/Workers）。push 到 `main` → Production；PR/分支 → Preview。**不依赖任何 agent 本机在线**（吸取 polymarketplayer 的教训）。
- **绑定**：D1 `D1`、R2 `R2`、（后续）KV；`PAYLOAD_SECRET` 等走 Cloudflare secret，不入库不进公开频道。

## 建议

- 采用本模板作为 SolveField 底座，直接进入 Phase 1（建 5 张 Collection + 权限）。
- 内容侧对齐 Ted 的 `content/seed.schema.json` 与 `content/tags-taxonomy.json`；KaTeX 录入遵循 `content/katex-authoring.md`（KaTeX 不支持 align/equation/siunitx/\ce，用 aligned/cases/bmatrix/mhchem）。
- 验收对齐根目录 `TEST_MATRIX.md`（Olivia 维护）。
