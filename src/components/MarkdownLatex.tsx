import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

import { katexMacros, katexOptions } from '@/lib/katex'
import { remarkLatexTextMacros, transformLatexInMarkdown } from '@/lib/remarkLatexTextMacros'

import 'katex/dist/katex.min.css'

// Markdown + LaTeX 渲染（服务端渲染，客户端不闪烁）。
// react-markdown 默认不渲染原始 HTML，天然防注入；公式走统一 @/lib/katex 配置。
// 文本流里的 LaTeX 文本宏（\textbf/\textit/\emph/\textrm/\textsf/\texttt）
// 和块级结构（\begin{itemize}/\item、\begin{enumerate}/\item、
// \begin{center}、\begin{quote}）在 **mdast 解析之前**由 transformLatexInMarkdown
// 转成 Markdown 等价物；数学模式（$...$ / $$...$$）内部保持原样
// 让 KaTeX 处理。task #15 修复了文本宏，task #16 扩到块级结构。
export function MarkdownLatex({ source }: { source: string }) {
  // KaTeX 渲染过程会原地改写 macros 对象，传副本避免跨请求状态泄漏
  const options = { ...katexOptions, macros: { ...katexMacros } }
  // source 预处理：把 LaTeX 文本/结构宏转 Markdown（保持 $...$ 内部原样）
  const normalized = transformLatexInMarkdown(source)
  return (
    <div className="markdownLatex">
      <ReactMarkdown
        remarkPlugins={[remarkLatexTextMacros, remarkMath]}
        rehypePlugins={[[rehypeKatex, options]]}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  )
}
