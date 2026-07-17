import React from 'react'

import type { Problem } from '@/payload-types'
import {
  competitionName,
  competitionYear,
  tagLabel,
  ui,
  type Lang,
} from '@/lib/problemI18n'

// zh/en 切换（服务端链接实现，保留当前路径与其它 query 参数）
export function LangSwitch({
  basePath,
  lang,
  extraQuery = {},
}: {
  basePath: string
  lang: Lang
  extraQuery?: Record<string, string>
}) {
  const hrefFor = (target: Lang) => {
    const params = new URLSearchParams(extraQuery)
    params.set('lang', target)
    return `${basePath}?${params.toString()}`
  }
  return (
    <nav aria-label={ui[lang].langLabel} className="langSwitch">
      {(['zh', 'en'] as const).map((l) =>
        l === lang ? (
          <span className="active" key={l}>
            {l === 'zh' ? '中文' : 'EN'}
          </span>
        ) : (
          <a href={hrefFor(l)} key={l}>
            {l === 'zh' ? '中文' : 'EN'}
          </a>
        ),
      )}
    </nav>
  )
}

// 列表/详情共用的一行元信息：竞赛 · 年份 · 难度 · 出处
export function ProblemMeta({ lang, problem }: { lang: Lang; problem: Problem }) {
  const t = ui[lang]
  const name = competitionName(problem.competition, lang)
  const year = competitionYear(problem.competition)
  return (
    <div className="problemMeta">
      {name ? (
        <span>
          {t.competition}: {name}
          {year ? ` · ${year}` : ''}
        </span>
      ) : null}
      <span className="difficulty" title={`${t.difficulty} ${problem.difficulty}/5`}>
        {'★'.repeat(problem.difficulty)}
        {'☆'.repeat(Math.max(0, 5 - problem.difficulty))}
      </span>
      <span>
        {t.source}: {problem.source}
      </span>
    </div>
  )
}

export function ProblemTags({ lang, problem }: { lang: Lang; problem: Problem }) {
  if (!problem.tags || problem.tags.length === 0) return null
  return (
    <div>
      {problem.tags.map((tag) => (
        <span className="tagChip" key={tag}>
          {tagLabel(tag, lang)}
        </span>
      ))}
    </div>
  )
}
