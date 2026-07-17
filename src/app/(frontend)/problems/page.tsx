import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { resolveLang, ui } from '@/lib/problemI18n'
import { LangSwitch, ProblemMeta, ProblemTags } from './components'

import './problems.css'

// 题库数据在 D1 中随时更新，必须每次请求实时查询（也避免构建期临时 D1 烤空页）
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const lang = resolveLang(params.lang)
  const t = ui[lang]
  const rawPage = Number(typeof params.page === 'string' ? params.page : '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1

  const payload = await getPayload({ config: await config })
  // 双保险：显式 where status=published + overrideAccess:false 走匿名访问控制，
  // 草稿/待审/归档题对访客绝不可见。
  const result = await payload.find({
    collection: 'problems',
    depth: 1,
    limit: PAGE_SIZE,
    overrideAccess: false,
    page,
    sort: '-createdAt',
    where: { status: { equals: 'published' } },
  })

  const pageHref = (p: number) => `/problems?${new URLSearchParams({ lang, page: String(p) })}`

  return (
    <div className="problemsPage">
      <header className="problemsHeader">
        <h1>{t.listTitle}</h1>
        <LangSwitch basePath="/problems" extraQuery={{ page: String(result.page ?? 1) }} lang={lang} />
      </header>

      {result.docs.length === 0 ? (
        <p>{t.listEmpty}</p>
      ) : (
        <ol className="problemList">
          {result.docs.map((problem) => (
            <li className="problemCard" key={problem.id}>
              <a className="cardTitle" href={`/problems/${problem.slug}?lang=${lang}`}>
                {problem.source}
              </a>
              <ProblemMeta lang={lang} problem={problem} />
              <div style={{ marginTop: 8 }}>
                <ProblemTags lang={lang} problem={problem} />
              </div>
            </li>
          ))}
        </ol>
      )}

      <nav className="pagination">
        {result.hasPrevPage ? (
          <a href={pageHref((result.page ?? 2) - 1)}>{t.prevPage}</a>
        ) : (
          <span className="disabled">{t.prevPage}</span>
        )}
        <span>
          {t.pageOf(result.page ?? 1, Math.max(1, result.totalPages))} · {t.totalDocs(result.totalDocs)}
        </span>
        {result.hasNextPage ? (
          <a href={pageHref((result.page ?? 0) + 1)}>{t.nextPage}</a>
        ) : (
          <span className="disabled">{t.nextPage}</span>
        )}
      </nav>
    </div>
  )
}
