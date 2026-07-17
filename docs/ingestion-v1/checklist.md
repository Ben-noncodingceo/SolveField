# SolveField ingest v1 校核清单

用于 Agent 自检、管理员审核和 Olivia 验收。任一“阻断”项失败，都不能发布正式题。

## A. 原始来源与身份

- [ ] 每个 PDF 的 `byteSize/pageCount/fileHash` 由原文件重算，不信任客户端上报。
- [ ] `bundleHash` 按契约算法重算一致。
- [ ] 原 PDF 已存 R2 私有/受控对象，`r2ObjectKey` 可回看且未暴露 service token。
- [ ] 竞赛名、年份或届次、试卷、题号均能指向具体页码证据。
- [ ] `year` 与 `editionLabel` 至少一项非空；不根据常识猜年份。
- [ ] `pageIndex` 与 `printedPageLabel` 未混淆。
- [ ] 来源/权利说明非空。

## B. JSON、字段与枚举

- [ ] JSON 可解析，且通过 `ingest-v1.schema.json`（Draft-07）。【阻断】
- [ ] 无 schema 未定义字段；nullable 字段缺内容时显式写 `null`。
- [ ] `originalLanguage` 使用规定语言码；`level`、workflow 枚举合法。
- [ ] `difficulty` 为 1–5 整数。
- [ ] `tags[]` 全部存在于 `tags-taxonomy.json`。【阻断】
- [ ] `fieldAssessments` 至少覆盖 schema 要求的九个关键 JSON Pointer。
- [ ] confidence 在 0–1；needsReview 触发规则符合契约。

## C. 题干、翻译、解析与公式

- [ ] `contentOriginal` 逐段对照源 PDF，不丢标题、分值、小问、条件、单位、提示和图号。【阻断】
- [ ] 原文与译文分离；翻译没有覆盖原文。
- [ ] 题目 PDF 无解析时 answer 字段为 `null`，并提示 `MISSING_ANSWERS`。
- [ ] 上下标、正负号、矢量、希腊字母、积分、矩阵、分式逐项视觉核对。
- [ ] Markdown 围栏/强调/标题闭合；`$...$` 和 `$$...$$` 成对。
- [ ] 用正式详情页同一 KaTeX macros/配置跑所有非空内容字段，0 个不可渲染公式。【阻断】
- [ ] KaTeX 通过后仍抽样对照 PDF，确认数学语义而非只确认语法。
- [ ] 中文术语、量纲、单位、数值、题号与英文一致。

## D. 图片

- [ ] PDF 中每幅解题相关图片都有一个 `images[]` 项和唯一 `assetKey`。
- [ ] 正文每个 `asset://...` marker 恰好对应一个 image，且每个 image 被引用。【阻断】
- [ ] bbox 坐标为 0–1、左上原点，满足边界条件；crop 不含无关页眉页脚且不截标注。
- [ ] crop 清晰可读，生成 raw-byte SHA-256，并上传受控 R2 key。【阻断】
- [ ] alt 说明图中物理关系/方向/关键标注，不只写“图 1”。
- [ ] caption、source page、正文位置正确。

## E. 难度与标签

- [ ] 难度按“建模步数 × 方法门槛 × 计算量”判断，并填写 `difficultyBasis`。
- [ ] 整题多小问取最难小问作为整体难度，且与 rubric 锚点横向比对。
- [ ] 每个标签有具体题目证据，不按竞赛名或题目标题机械猜测。
- [ ] 方法标签与物理标签可并用；无合适 taxonomy key 时记录缺口，不私造 key。
- [ ] 难度和标签均保持 `needsReview=true`，直到教研/管理员确认。

## F. Hash、幂等与重复题

- [ ] 服务端重算 `contentHash` 与上报值一致。【阻断】
- [ ] 服务端重算 `idempotencyKey` 与上报值一致。【阻断】
- [ ] 同一 idempotency key 重试返回同一 draft，不增加 job/item 数。
- [ ] 相同 `(competitionSlug,paperCode,problemCode)` + 相同 contentHash 判同版本。
- [ ] 相同身份 + 不同 contentHash 进入 revision/diff，不生成第二道正式题。
- [ ] 相同 contentHash + 不同身份或模糊相似候选只标记人工复核，不自动覆盖。

## G. 权限、审核与审计

- [ ] Agent/service token 只能创建/更新导入草稿。【阻断】
- [ ] Agent token 调 publish/approve、用户管理或直接写正式 Problem 均返回 403。【阻断】
- [ ] 管理员后台能并排查看源页、原文、译文、公式预览、图片、推荐难度/标签、confidence 和问题清单。
- [ ] warning 醒目展示；error 时审核发布按钮禁用。
- [ ] 管理员可逐字段修改、退回并填写理由。
- [ ] 只有管理员登录会话可“审核通过并发布”。【阻断】
- [ ] 发布事务记录原输入、Agent 输出、人工 diff、审核人、审核时间、正式 Problem ID。
- [ ] service token 仅存私密环境，日志/错误/前端/README/频道均无明文凭证。

## H. IPhO 2026 T1 样例专项验收

- [ ] 三个源文件 hash 分别为 `7b6d…982c`、`fda3…d54`、`2316…9f7c`。
- [ ] bundle hash 为 `19b011…dc0`；idempotency key 为 `ingest-v1:f8f63d…715`。
- [ ] 三个拆页 PDF 的 `pageIndex` 都是 1，`printedPageLabel` 依次为 4、5、6。
- [ ] T1-A/B/C 分值 3.0/3.5/3.5，总分 10，标题和小问齐全。
- [ ] 图 1a/1b/1c 均已映射；图片 crop/hash/R2 未生成前保持 review warning。
- [ ] 难度推荐 4，标签只使用 taxonomy v1 的五个既有 key。
- [ ] answer 三语字段为 `null`，因为来源只有题干。
- [ ] 中文翻译、图片 alt、难度和标签由 Ted/管理员人工确认后才可发布。

