import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

import { katexOptions } from '@/lib/katexOptions'

import 'katex/dist/katex.min.css'

// Markdown + LaTeX 渲染（服务端渲染，客户端不闪烁）。
// react-markdown 默认不渲染原始 HTML，天然防注入；公式走统一 katexOptions。
export function MarkdownLatex({ source }: { source: string }) {
  return (
    <div className="markdownLatex">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, katexOptions]]}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
