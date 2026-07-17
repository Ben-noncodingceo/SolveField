import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { MarkdownLatex } from '@/components/MarkdownLatex'
import { pickAnswer, pickContent, resolveLang, ui } from '@/lib/problemI18n'
import { LangSwitch, ProblemMeta, ProblemTags } from '../components'

import '../problems.css'

export const dynamic = 'force-dynamic'

export default async function ProblemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const lang = resolveLang((await searchParams).lang)
  const t = ui[lang]

  const payload = await getPayload({ config: await config })
  // 与列表页相同的双保险：published-only + 匿名访问控制
  const result = await payload.find({
    collection: 'problems',
    depth: 1,
    limit: 1,
    overrideAccess: false,
    where: {
      and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }],
    },
  })
  const problem = result.docs[0]
  if (!problem) notFound()

  const content = pickContent(problem, lang)
  const answer = pickAnswer(problem, lang)

  return (
    <div className="problemsPage problemDetail">
      <header className="problemsHeader">
        <a href={`/problems?lang=${lang}`}>{t.backToList}</a>
        <LangSwitch basePath={`/problems/${problem.slug}`} lang={lang} />
      </header>

      <h1>{problem.source}</h1>
      <ProblemMeta lang={lang} problem={problem} />
      <div style={{ marginTop: 10 }}>
        <ProblemTags lang={lang} problem={problem} />
      </div>

      <section className="problemSection">
        <h2>{t.statement}</h2>
        {content.fellBack ? (
          <p className="fallbackNotice">{t.fallbackNotice(content.shownLang)}</p>
        ) : null}
        <MarkdownLatex source={content.text} />
      </section>

      {answer ? (
        <section className="problemSection">
          <h2>{t.solution}</h2>
          {answer.fellBack ? (
            <p className="fallbackNotice">{t.fallbackNotice(answer.shownLang)}</p>
          ) : null}
          <MarkdownLatex source={answer.text} />
        </section>
      ) : null}

      {problem.officialSolutionUrl ? (
        <p className="problemSection">
          <a href={problem.officialSolutionUrl} rel="noopener noreferrer" target="_blank">
            {t.officialSolution} ↗
          </a>
        </p>
      ) : null}
    </div>
  )
}
