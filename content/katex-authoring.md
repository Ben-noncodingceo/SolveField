# SolveField 作者 LaTeX / KaTeX 录入规范

面向题目录入者与开发者。目标：**录入的公式在前台（KaTeX）一次渲染成功、桌面/移动端都不溢出不错乱**。KaTeX 只实现 LaTeX 数学子集，下面的红线能避免绝大多数渲染 bug。

> 渲染链路建议：Markdown/MDX + `remark-math` + `rehype-katex`（SSR 预渲染，客户端不闪烁）。后台编辑用同一套做实时预览，保证"所见即所得"。

## 1. 分隔符约定（团队统一）
- **行内公式**：`$ ... $`，例：`凑成 $a=\dfrac{\Delta h}{2\sqrt2}$。`
- **独立公式**：`$$ ... $$`（或 `\[ ... \]`）。
- 正文里出现字面 `$`（货币等）用 `\$` 转义，避免被误当公式分隔符。
- **不要**用 `\(` `\)` 与 `\[` 混搭；全站二选一，建议 `$`/`$$`（与 remark-math 默认一致）。

## 2. ✅ 支持 / ❌ 不支持（KaTeX 关键红线）
**❌ 不要用顶层 amsmath 环境**（这是最高频的报错来源）：
- ❌ `\begin{align}` / `\begin{equation}` / `\begin{eqnarray}` / `\begin{align*}`
- ✅ 改用 KaTeX 支持的环境，放在 `$$ ... $$` 内：
  - 多行对齐：`aligned`（替代 align）
  - 多行居中：`gathered`
  - 分支：`cases`
  - 矩阵：`matrix` `pmatrix` `bmatrix` `Bmatrix` `vmatrix` `Vmatrix`
  - 通用表格：`array`

**其它红线：**
- ❌ `\label` / `\ref` / 自动编号 → KaTeX 无编号系统；需要编号用 `\tag{1}`。
- ❌ `\newcommand` / `\def` 写在题目正文里通常无效 → **自定义宏必须在 KaTeX 全局 `macros` 选项里预置**（见 §4），不要指望在单题内定义。
- ❌ `siunitx`（`\SI{}{}`、`\qty`）、`\begin{tikzpicture}`、`\usepackage`、`\includegraphics` → 全部不支持。单位首选 `\,\mathrm{...}`（数字与单位间已含细空格）；若改用宏 `\unit{...}`，其定义已内建细空格，**前面不要再加 `\,`、`\ ` 或 `~`**，否则会渲染成双细空格（`5\,\unit{m}` → `5\,\,m`，偏宽但不报错）——二者择一，勿叠加。图片走图片字段/相对路径，不用公式画图。
- ❌ 化学式 `\ce{...}` 默认不支持 → 若需要，开启 KaTeX 的 **mhchem 扩展**；否则简单化学式用普通数学写：`\mathrm{O_3}`、`\mathrm{O_2}`。
- ✅ 支持：`\frac \dfrac \sqrt \sum \int \oint \prod \lim \vec \hat \bar \boldsymbol \mathrm \mathbf \text \cdot \times \partial \nabla \approx \propto \Rightarrow \Longrightarrow \cases \substack \overset \underset \color \left \right \big \Big` 等常用命令。

## 3. 常见构造的推荐写法
| 需求 | 写法 |
|---|---|
| 行内分数 | `$\dfrac{a}{b}$`（`\dfrac` 比 `\frac` 在行内更清晰） |
| 独立多行推导 | `$$\begin{aligned} E&=mc^2\\ &=\dots \end{aligned}$$` |
| 方程组 | `$$\begin{cases} x+y=1\\ x-y=0 \end{cases}$$` |
| 矩阵 | `$$\begin{bmatrix} a&b\\ c&d \end{bmatrix}$$` |
| 定积分 | `$$\int_{0}^{\pi} \sin x\,\mathrm{d}x = 2$$` |
| 矢量 | `$\vec p=\boldsymbol p$`（全站二选一，建议 `\vec` 或统一 `\boldsymbol`） |
| 单位 | `$a\approx 0.50\,\mathrm{m}$`（数字与单位间用 `\,` 细空格） |
| 微分号 | 统一 `\mathrm{d}`（可在 macros 里定义 `\dd`，见 §4） |

## 4. 建议的全局宏（KaTeX macros 选项，开发预置）
在 KaTeX 配置里预置，作者即可直接使用，减少重复与不一致：
```js
katexOptions = {
  throwOnError: false,          // 出错不崩页，显示红色错误占位
  errorColor: "#cc3333",
  strict: false,                // 容忍 \, 等排版空格
  macros: {
    "\\dd": "\\mathrm{d}",      // 微分号
    "\\ee": "\\mathrm{e}",      // 自然常数
    "\\vv": "\\boldsymbol{#1}", // 矢量（与全站统一）
    "\\unit": "\\,\\mathrm{#1}" // 单位（已含前置细空格：用 \unit{} 时前面不要再加 \, / ~，否则会变双细空格）
  }
  // 如需化学式：trust + 引入 mhchem 扩展后可用 \ce{...}
}
```
> `throwOnError:false` 很关键：单题公式写错时只显示局部红色提示，不会整页白屏——对 Wiki 众包录入尤其重要。

## 5. 移动端不溢出（对应 Phase 2 门禁）
- KaTeX **不会自动折行**长公式。超宽独立公式请：
  1. 用 `aligned` 在 `=`/`+` 处**手动断行**；且
  2. 前端给块级公式外套一个 `overflow-x:auto` 容器（`.katex-display { overflow-x:auto; overflow-y:hidden; }`），窄屏可横向滚动而非撑破布局。
- 行内公式尽量短；长表达式改独立公式。

## 6. 入库（JSON/D1）注意
- 公式**原样保存 LaTeX 源码**（不预渲染成 HTML/图片）；渲染在读取时做。
- 存入 JSON 时**反斜杠要转义为 `\\`**（如 `\\dfrac`、`\\int`）；存入数据库文本字段则保持单反斜杠。seed 文件（JSON）里统一双写。
- 录入内容做**白名单/XSS 清理**（KaTeX `trust:false` 默认禁 `\href` 等；如需链接单独放行）。

## 7. 快速自检清单（录入前过一遍）
- [ ] 没有 `\begin{align}`/`equation`/`eqnarray`（改 `aligned`/`gathered`）
- [ ] 没有 `\SI`、`\ce`（未开扩展时）、`\includegraphics`、`\newcommand`
- [ ] 单位用 `\,\mathrm{}`；微分用 `\mathrm{d}`/`\dd`
- [ ] 超宽公式已手动断行
- [ ] 三语字段该填 `null` 的没有伪造译文
