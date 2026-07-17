# SolveField PDF → 题库草稿 ingest v1 契约

版本：`solvefield.ingest.v1`  
配套机器契约：`ingest-v1.schema.json`  
完整样例：`ingest-v1-example-ipho2026-t1.json`

## 1. 不可突破的边界

1. Agent/service token 只能创建或更新 `IngestionJob/IngestionItem` 草稿，不能创建 `published` Problem，不能调用审核发布接口。
2. 管理员在后台查看原 PDF、结构化文本、公式预览、图片、难度、标签、置信度和警告；修改后点击“审核通过并发布”，才映射到正式 `Competitions/Problems/Media`。
3. 退回必须记录理由；重新提交形成新 revision。永久记录原始输入、Agent 输出、人工修改 diff、审核人和时间。
4. 原文不可被翻译覆盖。`contentOriginal` 永远保存源语言；`contentZh/contentEn` 是附加内容，可为 `null`。

## 2. 推荐持久化模型

这不是要求 David 立即改正式题库字段，而是隔离不可信导入数据的最小模型。

| 暂存对象 | 核心字段 | 约束 |
|---|---|---|
| `IngestionJobs` | `importId`, `idempotencyKey`, `sourceBundle`, `actor`, `status` | `importId`、`idempotencyKey` 唯一；状态仅 `needs-review/reviewed/rejected` |
| `IngestionItems` | job 关联、competition/paper/item、`fieldAssessments`, `validation`, `revisionOf`, `createdProblem` | 只保存草稿；审核前 `createdProblem=null` |
| `IngestionAssets`（或复用 Media 并标 draft） | item 关联、source page/bbox、R2 key、hash、alt/caption | 未审核资源不可出现在公开 URL 列表 |

## 3. 字段映射

### 3.1 顶层

| ingest v1 字段 | 类型 / nullable | 用途与落库建议 |
|---|---|---|
| `schemaVersion` | 固定字符串，非空 | 必须等于 `solvefield.ingest.v1` |
| `importId` | string，非空 | 调用方为一次逻辑导入生成的稳定 ID |
| `idempotencyKey` | `ingest-v1:` + 64 位十六进制，非空 | API 重试去重，服务端唯一 |
| `sourceBundle` | object，非空 | 原 PDF 文件、hash、R2、来源和权利说明 |
| `competition` | object，非空 | 竞赛身份；`year` 与 `editionLabel` 至少一个非空 |
| `paper` | object，非空 | 试卷、栏目、源语言 |
| `item` | object，非空 | 一个待审核题目草稿 |
| `fieldAssessments` | `{JSON Pointer: assessment}`，非空 | 每字段的置信度、复核状态、方法和页码证据 |
| `validation` | object，非空 | schema/taxonomy/KaTeX/图片与全局问题 |
| `workflow` | object，非空 | 强制 `createAs=draft`, `publishAllowed=false`, `humanApprovalRequired=true` |

### 3.2 竞赛、试卷、题号

| ingest 字段 | 类型 / nullable | 正式库映射 |
|---|---|---|
| `competition.competitionSlug` | slug string，非空 | `Competitions.slug`；如 `ipho-2026` |
| `competition.nameOriginal` | string，非空 | 来源显示名称；正式库没有同名字段时保留在 provenance |
| `nameZh/nameEn` | string 或 `null` | `Competitions.nameZh/nameEn` |
| `year` | integer 1900–2100 或 `null` | `Competitions.year`；无可靠年份不得猜造 |
| `editionLabel` | string 或 `null` | 如 `56th`、`第 40 届`；建议加入 Competitions 或 provenance |
| `level` | `national/regional/world` | `Competitions.level` |
| `paper.paperCode` | string，非空 | 稳定短码，如 `theory`, `exp`, `round-1`；建议正式题增加该字段 |
| `paperTitle` | string，非空 | 试卷显示名或 provenance |
| `section` | string 或 `null` | 卷内栏目/部分 |
| `problemCode` | string，非空 | 题号，如 `T1`, `A2`；建议正式题增加该字段 |
| `problemOrder` | integer ≥ 1 | 同卷排序 |

`year` 与 `editionLabel` 的规则：二者都识别到就都存；只识别到“第 N 届”时 `year=null`，不得用模型常识反推年份。后台可人工补齐。

### 3.3 正式 Problem 草稿

| ingest 字段 | 类型 / nullable | 正式库映射 |
|---|---|---|
| `slugCandidate` | slug string，非空 | 审核时检查冲突后写 `Problems.slug` |
| `originalLanguage` | BCP-47 简码，非空 | `Problems.originalLanguage` |
| `contentOriginal` | Markdown + LaTeX string，非空 | `Problems.contentOriginal` |
| `contentZh/contentEn` | string 或 `null` | `Problems.contentZh/contentEn` |
| `answerOriginal/answerZh/answerEn` | string 或 `null` | 对应解析字段；题目 PDF 无答案时必须为 `null`，不能编造 |
| `images[]` | array，可空 | 审核后映射 Media/R2，并替换 `asset://...` 标记 |
| `difficulty` | integer 1–5，非空 | `Problems.difficulty`，仅推荐值 |
| `tags[]` | taxonomy key array，可空 | `Problems.tags`；必须全部存在于 `tags-taxonomy.json` |
| `sourcePages[]` | page ref array，非空 | provenance；指向每个拆分 PDF 内页码与原卷印刷页码 |
| `contentHash` | SHA-256，非空 | 内容级重复检测和修改追踪 |
| `allowWikiEdit` | boolean | `Problems.allowWikiEdit` |

`difficultyBasis` 和 `tagRecommendations` 是推荐依据，不直接复制进 `Problems`；建议保留在导入审计记录中。

## 4. confidence 与 needsReview

`confidence` 是 0–1 的事实置信度，不是题目质量评分：

| 区间 | 含义 | 默认动作 |
|---|---|---|
| 0.99–1.00 | 明确元数据或人工逐项核对 | 可不标红，但仍受管理员发布门约束 |
| 0.95–0.989 | 可用文本层提取，并与页面视觉核对 | 普通显示；公式/复杂排版仍复核 |
| 0.85–0.949 | 合理推断、机器翻译或图片裁剪 | `needsReview=true`，后台黄色提示 |
| 0.70–0.849 | 存在实质歧义 | `needsReview=true`，后台红色提示 |
| < 0.70 | 不应自动采用 | 阻止送审，要求重新识别或人工填写 |

以下规则优先于数值阈值：

- 竞赛、年份/届次、试卷、题号、页码的 `confidence < 0.98` 必须复核。
- `contentOriginal` 只要经过 OCR、发现断词/上下标/希腊字母/公式歧义，或 `confidence < 0.97`，必须复核。
- 机器翻译一律 `needsReview=true`。
- 难度、标签是主观推荐，一律 `needsReview=true`，直到教研/管理员确认。
- 图片 crop、alt、题干插入位置一律 `needsReview=true`，直到视觉检查通过且生成图片 hash/R2 key。
- KaTeX 任一错误、图片 marker 未解析、必填字段缺失，必须阻止管理员发布。
- 源 PDF 没有解析时答案字段填 `null`，同时添加 `MISSING_ANSWERS`；不得降低原文抽取置信度，也不得让 AI 补写后冒充官方解析。

顶层 `validation.needsReview = true`，只要任一字段 `needsReview=true` 或存在 warning/error。即使全部为 false，Agent 仍不能发布。

## 5. PDF、公式与图片映射

### 页码

- `pageIndex`：上传的这个 PDF 内从 1 开始的物理页序号。
- `printedPageLabel`：原完整试卷印在页面上的页码，可为 `null`。
- 拆页 PDF 的 `pageIndex=1` 并不等于原卷第 1 页；IPhO T1 样例分别是 `1/printed 4`、`1/printed 5`、`1/printed 6`。

### Markdown / LaTeX

- JSON 解码后的 LaTeX 是单个反斜杠；JSON 文件中按标准转义为双反斜杠。
- 原文字段只做排版结构恢复，不改写物理含义；使用 LF 换行、Unicode NFC。
- 行内公式用 `$...$`，独立公式用 `$$...$$`；最终必须调用与正式详情页相同的 KaTeX macros 和 `throwOnError:false` 检查器。
- 公式检查通过只说明语法可渲染，不说明 OCR 数学含义正确；仍需对照源页。

### 图片

- 题干先用 `![alt](asset://asset-key)` 占位；审核发布时才替换成受控 Media URL/关系。
- `sourceRegion` 使用 0–1 归一化坐标，原点为页面左上角；必须满足 `x+width≤1`、`y+height≤1`（API 增加交叉字段校验）。
- `alt` 描述解题所需信息，不能只写“图 1”；图片中的方向、标注、装置关系应被概括。
- 图片裁出后按原始字节计算 `contentHash`，上传 R2 后写 `r2ObjectKey`。二者未生成时可为 `null`，但不能进入管理员发布状态。

## 6. Hash、幂等与重复题

### 6.1 精确算法

1. `SourceFile.fileHash`：`SHA-256(raw PDF bytes)`，格式 `sha256:<hex>`。
2. `bundleHash`：按 `originalFileName` 升序，把每个文件写成一行 `<fileName>:<fileHashHex>\n`，对 UTF-8 字节做 SHA-256。
3. 规范化文本：Unicode NFC、CRLF→LF、删除每行行尾空白和全文首尾空白；**不**折叠正文空格，不改 LaTeX 命令。
4. `contentHash`：对下列对象做 RFC 8785 JCS 后 SHA-256：

```json
{
  "competitionSlug": "...",
  "paperCode": "...",
  "problemCode": "...",
  "originalLanguage": "...",
  "contentOriginal": "...",
  "contentZh": null,
  "contentEn": null,
  "answerOriginal": null,
  "answerZh": null,
  "answerEn": null,
  "images": [
    {
      "assetKey": "...",
      "contentHash": null,
      "sourcePage": { "fileId": "...", "pageIndex": 1, "printedPageLabel": "..." },
      "sourceRegion": { "unit": "normalized", "origin": "top-left", "x": 0, "y": 0, "width": 1, "height": 1 },
      "placementMarker": "asset://..."
    }
  ]
}
```

5. `sourceItemKey = SHA-256(bundleHashHex + "\n" + problemCode)`。
6. `idempotencyKey = "ingest-v1:" + sourceItemKeyHex`。同一来源和题号重试必须返回同一 draft（HTTP 200），首次创建返回 201。

IPhO 2026 T1 样例的三个源文件 hash、bundle hash 与 idempotency key 都已用本地原文件计算，不是占位值。

### 6.2 服务端重复判定顺序

1. `idempotencyKey` 相同：返回已有 job/item，不新建。
2. `(competitionSlug, paperCode, problemCode)` 相同且 `contentHash` 相同：判为同题同版本。
3. 身份三元组相同但 `contentHash` 不同：创建/更新为待审核 revision，显示 diff，不新建第二道正式题。
4. `contentHash` 相同但身份不同：标记 `POSSIBLE_DUPLICATE_IDENTITY`，人工判断是否卷别/题号识别错。
5. 模糊候选建议：规范化原文相似度 ≥ 0.92，或任一图片 pHash 汉明距离 ≤ 8 时提醒；**不得自动合并或覆盖**。

## 7. API 最小行为契约

建议受限入口为 `POST /api/ingestion/jobs`：

- 先做 JSON Schema、taxonomy、hash 重算、页码引用、bbox、marker、KaTeX 检查。
- 客户提交的 `schemaValid/taxonomyValid` 只作报告；服务端必须自行重算，不可信任。
- error → 422，不落可送审草稿；warning → 可保存 `needs-review` 草稿。
- service token 权限仅 `ingestion:create/update/read-own`；无 `problems:publish`、用户管理、审核权限。
- `POST /approve` 只能由管理员登录会话调用；审核事务内创建/更新 Competition、Media、Problem，并写审计日志。
- 所有 token 只放私密环境；hash 存储、可轮换、可禁用，不进入前端、README、日志或频道。

## 8. IPhO 2026 T1 样例结论

- 来源：三份官方英文拆页 PDF；各 1 页，对应原卷印刷页 4–6。
- 识别：IPhO 2026 / 56th / theory / T1 / 原语言 en。
- 难度推荐：4。依据现有 `difficulty-rubric.md`，T1-B 已是 4 级锚点，整题取最难小问。
- 标签推荐：`fluid-mechanics`, `gravitation-orbits`, `quantum-basics`, `energy-momentum`, `approximation-perturbation`。
- 三幅图全部建立 source page、归一化 bbox、asset marker 与中英文 alt；crop/hash/R2 仍需开发流水线生成，所以保持复核状态。
- 题目 PDF 无解析，三个 answer 字段为 `null`；不能把既有教研解析伪装为官方源内容。

