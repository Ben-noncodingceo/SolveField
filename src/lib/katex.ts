import type { KatexOptions } from 'katex'

// 全站唯一的 KaTeX 渲染配置（契约见 content/katex-authoring.md §4）。
// 前台题目页、后台预览、ingest 校验（src/ingestion/validation.ts）都必须复用这一份，
// 避免"预览能过、上线失败"。macros 为 authoring 契约与 ingest 实测集的并集：
// \vv 与 \vect 同义共存，\unit 采用契约版（数字与单位间加 \, 细空格）。
export const katexMacros: Record<string, string> = {
  '\\dd': '\\mathrm{d}', // 微分号
  '\\ee': '\\mathrm{e}', // 自然常数
  '\\ii': '\\mathrm{i}', // 虚数单位
  '\\vv': '\\boldsymbol{#1}', // 矢量（契约名）
  '\\vect': '\\boldsymbol{#1}', // 矢量（ingest 兼容别名）
  '\\unit': '\\,\\mathrm{#1}', // 单位
}

export const katexOptions: KatexOptions = {
  throwOnError: false, // 单条公式出错只显示红色占位，不整页崩
  errorColor: '#cc3333',
  strict: 'warn',
  trust: false,
  macros: katexMacros,
}
