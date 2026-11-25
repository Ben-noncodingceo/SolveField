import { randomUUID } from 'node:crypto'

import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, test } from 'vitest'

import { GET as restGet } from '../../src/app/(payload)/api/[...slug]/route'
import { renderToHtml } from '../../src/lib/renderMarkdownLatex'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})

// Batch A / task #27 guard: the canonical source must survive the real local
// D1 -> Payload -> REST Response.json() path byte-for-byte. JavaScript source
// uses String.raw so each LaTeX command below contains one actual backslash;
// JSON serialization is expected to escape it on the wire and restore it after
// response.json().
const stressMarkdown = String.raw`Inline: $v=\omega r$, $\boldsymbol{F}=-\nabla U$.

$$\frac{\mathrm d^2u}{\mathrm d\theta^2}+u=\frac{ku^3}{mh^2}$$

$$\begin{pmatrix} A&B\\ B&C\end{pmatrix}\begin{pmatrix}\ddot\theta\\\ddot\varphi\end{pmatrix}=0$$

$$\begin{aligned} T&=\frac12 A\dot\theta^2+B\dot\theta\dot\varphi\\ &\quad+\frac12 C\dot\varphi^2.\end{aligned}$$

$$\begin{cases} x^2,&x\ge0\\ -x,&x<0.\end{cases}$$

$$\omega_\pm^2=\frac{mgaC+\kappa A\pm\sqrt{(mgaC+\kappa A)^2-4\Delta mga\kappa}}{2\Delta}$$

$$\int_{-\infty}^{+\infty}\frac{a\,\mathrm dx}{(a^2+x^2)^{3/2}}$$

Unit: $T=\SI{1.00}{K}$. Literal currency: \$5.

Code must remain literal:

~~~text
\frac{not}{math}
~~~`

const markdownFields = [
  'contentOriginal',
  'contentZh',
  'contentEn',
  'answerOriginal',
  'answerZh',
  'answerEn',
] as const

type ProblemApiDoc = Record<(typeof markdownFields)[number], string | null> & {
  id: number
  slug: string
}

describe.sequential('problem markdown serialization contract', () => {
  let competitionId: number
  let problemId: number
  const nonce = randomUUID()
  const competitionSlug = `serialization-audit-${nonce}`
  const problemSlug = `serialization-audit-${nonce}`

  beforeAll(async () => {
    const competition = await payload.create({
      collection: 'competitions',
      data: {
        slug: competitionSlug,
        nameZh: '序列化审计夹具',
        nameEn: 'Serialization audit fixture',
        year: 2026,
        level: 'world',
      },
    })
    competitionId = competition.id

    const problem = await payload.create({
      collection: 'problems',
      data: {
        slug: problemSlug,
        competition: competitionId,
        difficulty: 5,
        originalLanguage: 'en',
        contentOriginal: stressMarkdown,
        contentZh: stressMarkdown,
        contentEn: stressMarkdown,
        answerOriginal: stressMarkdown,
        answerZh: stressMarkdown,
        answerEn: stressMarkdown,
        source: 'Batch A serialization audit fixture',
        status: 'published',
      },
    })
    problemId = problem.id
  })

  afterAll(async () => {
    if (problemId) await payload.delete({ collection: 'problems', id: problemId })
    if (competitionId) await payload.delete({ collection: 'competitions', id: competitionId })
  })

  test('D1 text columns return every markdown field byte-for-byte through Payload', async () => {
    const problem = await payload.findByID({ collection: 'problems', id: problemId })

    for (const field of markdownFields) expect(problem[field], field).toBe(stressMarkdown)
  })

  test('REST JSON restores one-backslash LaTeX without double escaping', async () => {
    const url = new URL('http://localhost/api/problems')
    url.searchParams.set('depth', '0')
    url.searchParams.set('limit', '1')
    url.searchParams.set('where[slug][equals]', problemSlug)
    const response = await restGet(new Request(url), {
      params: Promise.resolve({ slug: ['problems'] }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { docs: ProblemApiDoc[] }
    expect(body.docs).toHaveLength(1)
    for (const field of markdownFields) expect(body.docs[0]![field], field).toBe(stressMarkdown)

    // The decoded value has one command backslash, never the two-character
    // double-backslash prefix that would indicate application-level escaping.
    expect(body.docs[0]!.contentOriginal).toContain(String.raw`\theta`)
    expect(body.docs[0]!.contentOriginal).not.toContain(String.raw`\\theta`)
    expect(body.docs[0]!.contentOriginal).toContain(String.raw`\begin{aligned}`)
    expect(body.docs[0]!.contentOriginal).not.toContain(String.raw`\\begin{aligned}`)
  })

  test('the decoded REST value enters the shared renderer without a KaTeX error', async () => {
    const problem = await payload.findByID({ collection: 'problems', id: problemId })
    const html = renderToHtml(problem.contentOriginal)

    expect(html).not.toContain('katex-error')
    expect(html).toContain('class="katex"')
    expect(html).toContain('\\frac{not}{math}')
  })
})
