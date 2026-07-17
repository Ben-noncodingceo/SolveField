import type { Competition, Problem } from '@/payload-types'

import taxonomy from '../../content/tags-taxonomy.json'

// 前台语言：zh / en 二选一（URL ?lang= 控制，默认 zh）。
// 题目内容缺所选语言译文时优雅回退到 originalLanguage 的原文，绝不留空白。
export type Lang = 'zh' | 'en'

export const resolveLang = (raw: string | string[] | undefined): Lang =>
  raw === 'en' ? 'en' : 'zh'

// UI 文案（只覆盖本纵切用到的少量标签；Phase 2 全站 next-intl 接入后可迁移）
export const ui = {
  zh: {
    listTitle: '题库',
    listEmpty: '暂无已发布的题目。',
    statement: '题干',
    solution: '解析',
    difficulty: '难度',
    tags: '知识点',
    source: '出处',
    competition: '竞赛',
    officialSolution: '官方解析',
    backToList: '← 返回题库',
    prevPage: '← 上一页',
    nextPage: '下一页 →',
    pageOf: (page: number, total: number) => `第 ${page} / ${total} 页`,
    totalDocs: (n: number) => `共 ${n} 题`,
    fallbackNotice: (lang: string) => `该语言版本暂缺，以下显示原文（${lang}）`,
    langLabel: '语言',
  },
  en: {
    listTitle: 'Problems',
    listEmpty: 'No published problems yet.',
    statement: 'Statement',
    solution: 'Solution',
    difficulty: 'Difficulty',
    tags: 'Topics',
    source: 'Source',
    competition: 'Competition',
    officialSolution: 'Official solution',
    backToList: '← Back to problems',
    prevPage: '← Prev',
    nextPage: 'Next →',
    pageOf: (page: number, total: number) => `Page ${page} / ${total}`,
    totalDocs: (n: number) => `${n} problems`,
    fallbackNotice: (lang: string) => `Not translated yet — showing the original (${lang})`,
    langLabel: 'Language',
  },
} as const

export type PickedText = {
  text: string
  // 实际展示的语言：所选语言，或回退后的 originalLanguage
  shownLang: string
  fellBack: boolean
}

const nonEmpty = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim().length > 0

// 题干：所选语言缺失 → 回退 contentOriginal（必填字段，保证不空白）
export function pickContent(problem: Problem, lang: Lang): PickedText {
  const translated = lang === 'zh' ? problem.contentZh : problem.contentEn
  if (nonEmpty(translated)) return { text: translated, shownLang: lang, fellBack: false }
  return { text: problem.contentOriginal, shownLang: problem.originalLanguage, fellBack: true }
}

// 解析：可选字段；所选语言缺失 → 回退 answerOriginal；全缺 → null（区块整体不显示）
export function pickAnswer(problem: Problem, lang: Lang): PickedText | null {
  const translated = lang === 'zh' ? problem.answerZh : problem.answerEn
  if (nonEmpty(translated)) return { text: translated, shownLang: lang, fellBack: false }
  if (nonEmpty(problem.answerOriginal))
    return { text: problem.answerOriginal, shownLang: problem.originalLanguage, fellBack: true }
  return null
}

export function competitionName(competition: Problem['competition'], lang: Lang): string | null {
  if (typeof competition !== 'object' || competition === null) return null
  const c = competition as Competition
  return lang === 'zh' ? c.nameZh : c.nameEn
}

export function competitionYear(competition: Problem['competition']): number | null {
  if (typeof competition !== 'object' || competition === null) return null
  return (competition as Competition).year
}

// 标签展示名来自 Ted 的单一事实源 content/tags-taxonomy.json，按语言取 zh/en
type Subtopic = { key: string; zh: string; en: string }
type Category = { key: string; zh: string; en: string; subtopics: Subtopic[] }

const tagLabels = new Map<string, { zh: string; en: string }>(
  (taxonomy.categories as Category[]).flatMap((cat) =>
    cat.subtopics.map((st) => [st.key, { zh: st.zh, en: st.en }]),
  ),
)

export const tagLabel = (value: string, lang: Lang): string => tagLabels.get(value)?.[lang] ?? value
