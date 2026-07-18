# SolveField — 分阶段验收矩阵 & QA 基线 (task #26)

物理竞赛 Wiki 题库社区 · PayloadCMS + Cloudflare 全栈
Owner: @Olivia (测试/运营) · Dev: @David · Plan: @Cindy · v1 (2026-07-17)

> 目的：给每个开发阶段定义**客观、可自动化、可复现**的验收标准与门禁，让 David 的每一次交付都能被快速、一致地验证，避免在不通的地基上白建阶段（呼应 David 的 Phase-0 spike 建议）。

---

## 0. QA 策略与门禁模型

**阶段门禁（Gate）**：每个阶段交付后，必须依次通过
1. **构建门 (Build Gate)**：TS 严格模式 0 error、`next build` / `payload build` 通过、无 lint 阻断。
2. **部署门 (Deploy Gate)**：成功部署到 Cloudflare Preview（见 §1 前置检查），页面可访问、admin 后台可登录。
3. **冒烟门 (Smoke Gate)**：该阶段 smoke 用例 100% 通过（见 §3）。
4. **验收门 (Acceptance Gate)**：该阶段 acceptance 用例通过（见 §2 每阶段矩阵）。
5. **回归门 (Regression Gate)**：已通过的历史阶段 smoke 不被破坏（回归套件）。
6. **文档门 (Docs/README Gate)**（comet 硬性要求 + Cindy 门禁）：代码/配置有变更时，`README.md` 必须同步更新「当前阶段 / 本次变更 / 运行+部署命令 / 下一步」四项；且**交付必须已合并到 `main`，`main` 必须可构建**。README 未同步 → 该阶段直接不通过。

任一门失败 → 打回 David，附**可复现步骤 + 期望/实际 + 日志/截图**，不进入下一阶段。

**测试分层**
- **Smoke**（快，每次部署跑，目标 < 3 min）：核心链路存活性，红=阻断上线。
- **Regression**（全，每阶段/发版跑）：覆盖所有已交付功能的正确性。
- **Exploratory**（人工）：UI/移动端/公式渲染观感等难自动化项。

**省 token 协作约定**（呼应用户"节省 token"要求）
- 验收标准前置、客观化 → David 自测对照即可，减少来回。
- 我提供**可直接跑的测试脚本/清单**（curl、Playwright smoke），David 交付前自查一遍。
- 用 seed 数据（Ted 提供的 IPhO 三语+LaTeX 题）做联调，David 不用造数据。
- Bug 反馈用统一模板（见 §6），一次说清，减少往返轮次。

---

## 1. GitHub → Cloudflare 自动部署前置检查 (Deploy Gate 细则)

部署链路**首选 GitHub → Cloudflare Pages 自动部署**（我这边好验证、不依赖本机 wrangler 登录态——polymarketplayer 曾因 wrangler 过期卡住）。项目一开始就要理顺：

| # | 前置检查项 | 通过标准 |
|---|---|---|
| D1 | 仓库 `Ben-noncodingceo/SolveField` 已连接 CF Pages 项目 | push 到指定分支自动触发构建 |
| D2 | 构建命令/输出目录正确（OpenNext/next-on-pages 适配） | CF 构建日志 success，无 Node API 不兼容报错 |
| D3 | D1 数据库已创建并 binding（`wrangler.toml` / Pages 绑定） | admin 能读写一个 Collection |
| D4 | R2 bucket 已创建并 binding + 上传适配器 | 后台上传一张图片成功、前台能取到 URL |
| D5 | KV namespace 已创建并 binding | 缓存/配置读写通 |
| D6 | 环境变量/secret 配置（PAYLOAD_SECRET、数据库、R2 key 等） | 无缺失；secret 不出现在公开频道/日志 |
| D7 | Preview 环境与 Production 分离 | PR/分支 → Preview URL；main → Prod |
| D8 | 迁移（D1 schema）可复现 | 有 `migrate` 命令 + 初始化 SQL，重建库一致 |
| D9 | 回滚路径 | 能回滚到上一次成功部署 |

> 若最终无法走 GitHub 自动部署，则退回 `wrangler`：需 comet 先 `wrangler login` 或提供 `CLOUDFLARE_API_TOKEN`（放 CI secret，不进公开频道）。

### 1b. 正式 URL 约束（部署目标）— 已定：子域名（Plan A）
账号：Cloudflare（绑 GitHub Ben-noncodingceo）· 域名：**playphysics.net**
正式地址：**`https://solvefield.playphysics.net`（子域名，根路径部署，无 basePath）** ✅ comet 2026-07-17 确认走 Plan A。
> 子域名方案：admin/API/静态资源都在根路径下，Next.js/Payload 无需 basePath——坑最少。原子路径(Plan B)的 basePath 验收项作废。

| # | 验收点 | 通过标准 |
|---|---|---|
| U1 | 自定义子域名绑定 | CF Pages 绑 `solvefield.playphysics.net`，DNS 解析生效 |
| U2 | HTTPS/SSL 证书 | 子域名 SSL 有效、自动续期，无证书告警 |
| U3 | 根路径路由 | 页面/admin/API/静态资源均在根路径（`/`、`/admin`、`/api`），无 basePath 前缀 |
| U4 | 静态资源 | JS/CSS/图片/字体(KaTeX) 无 404 |
| U5 | i18n 路由 | zh/en 路由在根下正确（如 `/en/...`）|
| U6 | 登录/回调 | 认证回调 URL = 子域名根，跳转正确 |
| U7 | 主域不受影响 | `playphysics.net` 及其它子域/项目不受影响 |
| U8 | Preview / Production binding 隔离 | 两环境各自 D1/R2/KV，不串数据 |

---

## 2. 分阶段验收矩阵（对齐 @Cindy 最终路线 Phase 0–7）

> 已与 Cindy 的执行蓝图对齐（Cloudflare 验证前置到 Phase 0 + 生产化 Phase 6）。每个 Phase 的门禁按下表核验。

### Phase 0｜技术可行性探针（David, task #25）
| 验收点 | 判定 |
|---|---|
| 最小 Next.js+Payload+strict TS 骨架启动 | 本地 `dev` 起来 |
| 类型检查 + 生产构建通过 | `tsc --noEmit` + `build` 0 error |
| Cloudflare Preview 部署成功 | Preview URL 可访问 |
| D1 适配 + 1 个最小 Collection 读写 | admin 建/读一条 |
| R2 上传样例 + KV + Workers/Pages 构建 | 端到端通 |
| GitHub 自动部署链路打通 | push → 自动构建 |
| 产出 `docs/ADR-001-cloudflare.md` + 可复现命令 | 文档齐 |
> **全项目地基，必须先绿再往下。**

### Phase 1｜项目底座 + 数据与权限
| 验收点 | 判定 |
|---|---|
| 5 个核心 Collection + R2 的 Upload/Media Collection | 字段与规格 §3 + Cindy 补充字段一致 |
| user/editor/admin 权限 + 草稿/发布/归档 | 逐角色通过 |
| 访客只能读 published | 未发布不可见 |
| 用户不能直接改 Problems | 无入口/被拒 |
| D1 migration 可从**空库重建** | 重建后结构一致 |
| seed 灌入成功 | IPhO seed 入库 |
| ProblemRatings `(problem,user)` 复合唯一 | DB 级约束拦截重复评分 |
| 审计/点踩字段 | totalDislikes/source/originalLanguage/三语/edit before-after 快照等齐全 |

**本地复现命令（每次 Phase 1 交付先跑）**：`pnpm install` → `npx tsc --noEmit` → `pnpm build` → `npx payload migrate`（本地 D1）→ `pnpm seed`（幂等）→ `pnpm run check:phase1`（seed 存在 / role 持久化 / (problem,user) 唯一约束拦截）。
**生产前置**：D1+Workers+R2 token（跑远程迁移）；KV namespace 真实 id 填入 `wrangler.jsonc`（占位 `KV_NAMESPACE_ID` 会导致部署失败——binding 未完成即阻断，不占位假通过）。

### Phase 2｜内容垂直切片：中英双语 + KaTeX

#### task #12（Doug）｜只读题目前端 `/problems` + `/problems/[slug]`（纵切并行，不动 schema）
| 验收点 | 判定 |
|---|---|
| `/problems` 列表页：仅列出**已 published** 题目 | 未 published 前端不可见（匿名） |
| `/problems/[slug]` 详情页：渲染 `contentOriginal`（Markdown + LaTeX） | 内容完整、无原始标记泄漏 |
| i18n zh/en 切换；缺失翻译**优雅回退到 originalLanguage** | 不留空白、可切回原文 |
| KaTeX 行内 `$...$` + 独立 `$$...$$`，`throwOnError:false`，与后台/ingest 契约**同一套 macros** | §附A 公式集全绿、两处渲染一致 |
| **题干中无原始 LaTeX 文本命令泄漏**：`\textbf`/`\textit`/`\emph`/`\textrm`/`\textsf`/`\textup` 等 LaTeX 文本宏不在页面 HTML 中显示为原始字符（应被渲染层正确转换为 HTML 语义标签） | `curl` 页面 HTML 不含 `\textbf{`/`\textit{` 等原始标记 |
| 匿名访客可读 published，**不暴露草稿/未审核内容** | 符合全局访问规则 |
| 纯新增前端路由/组件，不改 Payload schema/迁移（需只读新字段先与 David 对齐） | 无 schema/migration 变更 |
| 门禁：strict tsc / Next build / OpenNext worker build 三绿；SSR/OpenNext 渲染正常；README 三段 | 交付 @Olivia |
| 回归：`/` 200、`/admin` 200、`/api/problems` 已 published 不受影响 | 生产冒烟通过 |

#### Phase 2 整体（含后台录入/编辑，属 David 地基线，非 #12 范围）
| 验收点 | 判定 |
|---|---|
| 打通 后台录入→D1→API→前台详情页 | 端到端 |
| next-intl UI zh/en 切换（右上角常驻） | 全覆盖无漏译 |
| 题目 original/zh/en 分离；切语言只改优先展示**不覆盖原文** | 可随时切回原题 |
| KaTeX 服务端优先渲染、客户端不闪烁 | 打开即渲染 |
| 后台编辑实时预览 + 输入白名单/XSS 清理 | 预览正确、注入被清 |
| **不允许图片公式**（硬性规范1） | 均为原生渲染 |
| 门禁：seed 含行内/独立/多行/矩阵/积分/矢量/方程组，桌面+手机无溢出无错误 | §附A 公式集全绿 |

### Phase 3｜题库门户 + 分类筛选
| 验收点 | 判定 |
|---|---|
| 首页最小版 + 题库列表 + 详情 + 分页 | 可用 |
| 组合筛选：年份/竞赛(CPhO/IPhO/APhO)/级别(国/区/世)/难度1-5/标签 | 结果正确 |
| 点赞/点踩/评分排序参数预留 | 参数生效 |
| 查询条件进 URL（分享/刷新/SEO） | 刷新保持、可分享 |
| 常用筛选建 D1 索引 + 查询性能基线 | 有性能基线 |
| 门禁：组合筛选/空结果/非法参数/分页边界/多语言详情 | 全通过 |

### Phase 4｜登录用户互动（点赞/点踩/评分）
| 验收点 | 判定 |
|---|---|
| 点赞/点踩 + 1-5 星评分；**单用户单题唯一记录** | 复合唯一约束 problem+user |
| 原子更新 totalLikes/totalDislikes/avgScore/scoreCount | 数值与明细一致 |
| 提供统计修复脚本（防聚合漂移） | 脚本能重算校正 |
| KV 限流/热点缓存，但 D1 为最终事实来源 | 缓存与 DB 一致 |
| 门禁：重复点击不重复计数、改评分正确回算、并发不破坏唯一约束、访客被拒 | 全通过 |

### Phase 5｜Wiki 提案闭环（核心特色）
| 验收点 | 判定 |
|---|---|
| 用户提交多语言修订 + 类型 + 说明；**不能直改正式题** | 生成 ProblemEdits |
| editor/admin 审核 | 后台可审 |
| 通过 → 事务内更新题目 + 记录 before/after 快照 + 审核人/时间 | 版本发布、审计留痕 |
| 驳回**必须有理由** | 用户可见理由 |
| Payload versions + ProblemEdits 审计快照，支持查看历史 + **回滚** | 可回溯可回滚 |
| 门禁：提交→通过→新版本、提交→驳回→见理由、越权、并发审核、回滚 | 全通过 |

### Phase 6｜Cloudflare 生产化
| 验收点 | 判定 |
|---|---|
| 正式 D1/R2/KV binding + 环境变量 + Preview/Production 隔离 | §1 D1-D9 全绿 |
| 缓存失效 + 迁移/回滚 + 备份恢复说明 | 演练通过 |
| GitHub push→Preview；main→Production | 自动链路 |
| **不依赖某台 agent 机器长期在线** | 无本机依赖（吸取 polymarketplayer 桥接教训）|
| 门禁：全新环境按文档**一次部署成功**；上传/迁移/缓存/日志/回滚演练 | 全通过 |

### Phase 7｜门户完善 + 上线验收
| 验收点 | 判定 |
|---|---|
| 用户中心 + 提案状态页 + 响应式 + 可访问性 + SEO + 错误页 + 加载态 | 均可用 |
| 全量回归 + 安全检查 + 移动端验收 + 运营 seed 导入 | 通过 |
| 门禁：CI 全绿、关键用户旅程全通、无高严重度缺陷 | 达标 |
| 交付：源码/migrations/R2 adapter/i18n/KaTeX/部署文档 | 齐全 |

---

## 3. 冒烟测试套件 (Smoke, 每次部署跑)

目标 < 3 min，任一失败即阻断。随阶段增量启用对应项。

| ID | 用例 | 方法 |
|---|---|---|
| S1 | 前台首页 200 | curl 状态码 |
| S2 | admin 后台 200 + 可登录 | curl / Playwright |
| S3 | 语言切换 zh↔en UI 生效 | Playwright |
| S4 | 打开一个题详情，公式已渲染（DOM 出现 .katex） | Playwright |
| S4b | 题干 HTML 中无原始 LaTeX 文本命令泄漏（无 `\textbf{`/`\textit{` 等） | curl + grep |
| S5 | 一个 Collection API 读取正常 | curl API |
| S6 | 登录用户点赞一次成功、二次被拒 | Playwright/API |
| S7 | 提交一个 Wiki 提案成功入库 | API |
| S8 | R2 一张图可访问 | curl 图片 URL 200 |

---

## 4. 横切功能回归矩阵（每阶段/发版跑）

| 域 | 关键回归点 |
|---|---|
| 权限 §4 | 访客只读；登录用户可赞/评/提案但不可直接改题；editor 审提案改题；admin 全权 + 用户管理。**逐角色越权测试**（水平/垂直越权）|
| i18n | UI 全覆盖切换、原题不被翻译、三语字段独立、fallback |
| KaTeX | §附A 公式集全绿、移动端不错乱、无图片公式 |
| 筛选 | 各维度单独 + 组合 + 空结果 + 排序稳定 |
| 点赞/评分 | 唯一性约束（DB 级）、统计字段一致、并发防重 |
| Wiki 流程 | 提案→审核→覆盖→版本历史→回溯；驳回理由；留痕 |
| 存储 D1/R2/KV | 读写、迁移可复现、图片上传、缓存 |
| 部署 | §1 D1-D9 |
| 安全 | AI/输入防注入（若涉及）、越权、secret 不泄露、上传类型校验 |
| 移动端 | 首页/题库/详情/切换/公式，主流视口 |
| 构建/运行时隔离（回归门）| **生产 Worker 路径不得解析/加载 `wrangler`**（dev-only 依赖）；binding 解析走原生 `getCloudflareContext()`，仅本地 CLI/dev/build 才用 wrangler proxy。验证：部署后 `wrangler tail` 无 `No such module "wrangler"`、所有服务端路由非 500。（根因见 2026-07-17 Phase 0 生产 500）|
| 文档/README | 每次变更后 README 四项（当前阶段/本次变更/运行+部署命令/下一步）已同步；已合并 main 且 main 可构建 |

---

## 5. 环境与数据

- **环境**：local dev → CF **Preview**（每分支/PR）→ CF **Production**（main）。验收在 Preview 做，绿了再 promote。
- **Seed 数据**：用 @Ted 的 IPhO 2026 三语+原生 LaTeX+出处+官方解析题作首批 seed，灌库做联调（David 不用造数据）。另需覆盖：多竞赛/多年份/多难度/多标签/含图片题 各若干条，用于筛选与排序回归。

---

## 6. Bug 反馈模板（省 token，一次说清）

```
[阶段] Phase N  [严重度] 阻断/高/中/低  [域] 权限/i18n/KaTeX/...
标题: 一句话
复现: 1) ... 2) ... 3)
期望: ...
实际: ...
证据: 日志/截图/URL/请求响应
环境: Preview/Prod + commit
```

---

## 附A. KaTeX 公式测试集（阶段3必过）

覆盖：行内 `$E=mc^2$`、分式、上下标、根号、积分 `\int_a^b`、求和、微分/偏导、矢量 `\vec{F}`、希腊字母、多行 `aligned`、矩阵 `pmatrix`、方程组 `cases`、物理常见（麦克斯韦方程组、薛定谔方程、洛伦兹变换）。
⚠️ KaTeX 兼容坑（供 David/Ted 录入规范参考）：无 `\substack` 部分版本、`align` 需用 `aligned`、`\begin{equation}` 用行间 `$$`、`\text{}` 中文需字体支持。以 @Ted 的《KaTeX 录入规范》为准。
