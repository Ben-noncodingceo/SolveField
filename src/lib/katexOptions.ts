// 全站唯一的 KaTeX 渲染配置（契约见 content/katex-authoring.md §4）。
// 前台题目页、后台预览、ingest 校验都必须复用这一份，避免"预览能过、上线失败"。
export const katexOptions = {
  throwOnError: false, // 单条公式出错只显示红色占位，不整页崩
  errorColor: '#cc3333',
  strict: false,
  macros: {
    '\\dd': '\\mathrm{d}', // 微分号
    '\\ee': '\\mathrm{e}', // 自然常数
    '\\vv': '\\boldsymbol{#1}', // 矢量（全站统一）
    '\\unit': '\\,\\mathrm{#1}', // 单位
  },
}
