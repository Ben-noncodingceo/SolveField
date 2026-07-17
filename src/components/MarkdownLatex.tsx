import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

import { katexMacros, katexOptions } from '@/lib/katex'

import 'katex/dist/katex.min.css'

// Markdown + LaTeX 渲染（服务端渲染，客户端不闪烁）。
// react-markdown 默认不渲染原始 HTML，天然防注入；公式走统一 @/lib/katex 配置。
export function MarkdownLatex({ source }: { source: string }) {
  // KaTeX 渲染过程会原地改写 macros 对象，传副本避免跨请求状态泄漏
  const options = { ...katexOptions, macros: { ...katexMacros } }
  return (
    <div className="markdownLatex">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, options]]}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
