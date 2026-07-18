import { renderToStaticMarkup } from 'react-dom/server'

import { MarkdownLatex } from '@/components/MarkdownLatex'

// 服务端把前台 <MarkdownLatex> 组件（react-markdown + remark-math + rehype-katex，
// 单一源 @/lib/katex 配置）渲染成 HTML 字符串。给 KaTeX 语料回归 fixture 用，
// 让断言跑在**用户真正看到的渲染路径**上——比 ingest 抽取器多守一层 remark 的
// `$…$`/`$$…$$` 定界解析（抽取器只对预抽取公式跑 katex.renderToString）。
// 纯服务端（引入 react-dom/server），勿在客户端组件里 import。
export function renderToHtml(source: string): string {
  return renderToStaticMarkup(<MarkdownLatex source={source} />)
}
