import { articles, dataEnd } from '../db'
import { classify, expandSelection, focusOf, NODE_BY_ID, rootOf, TAXONOMY } from '../taxonomy'
import type { Article, ArticleSentiment, PortalRef, SentimentLabel } from '../types'

export const PERIODS = [1, 3, 7, 30] as const
const HOUR = 3_600_000
// Buckets line up with midnight in Asia/Jakarta (UTC+7)
const TZ_OFFSET = 7 * HOUR

export type Counts = Record<SentimentLabel, number>

/** The fields analysis needs; content is left out so large periods stay cheap to load. */
export type ArticleRow = Pick<Article, 'url' | 'title' | 'description' | 'imageUrl' | 'publishedAt' | 'portal' | 'category' | 'subcategory' | 'sentiment' | 'sentimentAttempts'> & {
  _id: string
}

export interface Group {
  id: string
  name: string
  articles: number
  analyzed: number
  counts: Counts
}

export interface ArticleCard {
  id: string
  title: string
  description: string | null
  url: string
  imageUrl: string | null
  publishedAt: string | null
  portal: Pick<PortalRef, 'key' | 'name'>
  category: { id: string; name: string }
  sentiment: Pick<ArticleSentiment, 'label' | 'score' | 'reason'> | null
}

export interface AnalysisSummary {
  period: { days: number; from: string; to: string }
  focus: { id: string; name: string; hasChildren: boolean } | null
  totals: Group
  breakdown: { by: 'category' | 'source'; rows: Group[] }
  sources: Group[]
  trend: {
    bucketHours: number
    points: { t: string; counts: Counts; analyzed: number }[]
    series: { key: string; name: string; points: (Counts & { analyzed: number })[] }[]
  }
  articles: ArticleCard[]
}

const emptyCounts = (): Counts => ({ positive: 0, neutral: 0, negative: 0 })

function group(id: string, name: string): Group {
  return { id, name, articles: 0, analyzed: 0, counts: emptyCounts() }
}

function add(g: { articles?: number; analyzed: number; counts: Counts } | (Counts & { analyzed: number }), row: ArticleRow) {
  const label = row.sentiment?.label
  if ('counts' in g) {
    g.articles = (g.articles ?? 0) + 1
    if (label) {
      g.analyzed++
      g.counts[label]++
    }
  } else if (label) {
    g.analyzed++
    g[label]++
  }
}

const leafOf = (row: ArticleRow) => classify(row.portal.key, row.category.slug, row.subcategory?.slug)

export function periodRange(days: number, now = Date.now()) {
  return { from: new Date(now - days * 24 * HOUR), to: new Date(now) }
}

export function bucketHoursFor(days: number) {
  return days <= 1 ? 2 : days <= 3 ? 6 : days <= 7 ? 12 : 24
}

/** Round-robin across portals, newest first, so the cards show as many different sources as possible. */
export function pickDiverse(rows: ArticleRow[], limit: number) {
  const byPortal = new Map<string, ArticleRow[]>()
  for (const row of [...rows].sort((a, b) => time(b) - time(a))) {
    const list = byPortal.get(row.portal.key) ?? []
    list.push(row)
    byPortal.set(row.portal.key, list)
  }
  // Portals with the newest article go first in every round
  const lists = [...byPortal.values()]
  const picked: ArticleRow[] = []
  for (let round = 0; picked.length < limit && lists.some((l) => l.length > round); round++) {
    for (const list of lists) {
      if (list[round] && picked.length < limit) picked.push(list[round]!)
    }
  }
  return picked
}

const time = (row: ArticleRow) => row.publishedAt?.getTime() ?? 0

function toCard(row: ArticleRow): ArticleCard {
  const leaf = leafOf(row)
  return {
    id: String(row._id),
    title: row.title,
    description: row.description,
    url: row.url,
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    portal: { key: row.portal.key, name: row.portal.name },
    category: { id: leaf, name: NODE_BY_ID.get(leaf)?.name ?? leaf },
    sentiment: row.sentiment
      ? { label: row.sentiment.label, score: row.sentiment.score, reason: row.sentiment.reason }
      : null,
  }
}

/** Everything the dashboard shows for one filter selection, computed from already-loaded rows. */
export function summarize(rows: ArticleRow[], selection: string[], days: number, now = Date.now()): AnalysisSummary {
  const leaves = expandSelection(selection)
  const focusNode = focusOf(leaves)
  const { from, to } = periodRange(days, now)
  const inPeriod = rows.filter((r) => r.publishedAt && r.publishedAt >= from && r.publishedAt <= to)
  const selected = leaves ? inPeriod.filter((r) => leaves.has(leafOf(r))) : inPeriod

  const totals = group('all', 'All')
  for (const row of selected) add(totals, row)

  // Sources
  const sourceMap = new Map<string, Group>()
  for (const row of selected) {
    const g = sourceMap.get(row.portal.key) ?? group(row.portal.key, row.portal.name)
    add(g, row)
    sourceMap.set(row.portal.key, g)
  }
  const sources = [...sourceMap.values()].sort((a, b) => b.articles - a.articles)

  // Breakdown: roots for a mixed selection, children for a parent, sources for a single leaf
  let breakdown: AnalysisSummary['breakdown']
  if (focusNode && !focusNode.children?.length) {
    breakdown = { by: 'source', rows: sources }
  } else {
    const nodes = focusNode ? focusNode.children! : TAXONOMY
    const keyOf = focusNode ? leafOf : (r: ArticleRow) => rootOf(leafOf(r))
    const map = new Map(nodes.map((n) => [n.id, group(n.id, n.name)]))
    for (const row of selected) {
      const g = map.get(keyOf(row))
      if (g) add(g, row)
    }
    breakdown = { by: 'category', rows: [...map.values()].filter((g) => g.articles > 0) }
  }

  // Trend buckets aligned to local midnight; empty buckets at either end are trimmed
  const bucketHours = bucketHoursFor(days)
  const size = bucketHours * HOUR
  const start = Math.floor((from.getTime() + TZ_OFFSET) / size) * size - TZ_OFFSET
  const count = Math.ceil((to.getTime() - start) / size)
  const topSources = sources.slice(0, 3)
  const bucket = (row: ArticleRow) => Math.floor((time(row) - start) / size)
  const points = Array.from({ length: count }, (_, i) => ({
    t: new Date(start + i * size).toISOString(),
    counts: emptyCounts(),
    analyzed: 0,
    articles: 0,
  }))
  const series = topSources.map((s) => ({
    key: s.id,
    name: s.name,
    points: Array.from({ length: count }, () => ({ ...emptyCounts(), analyzed: 0 })),
  }))
  for (const row of selected) {
    const i = bucket(row)
    if (i < 0 || i >= count) continue
    add(points[i]!, row)
    const s = series.find((x) => x.key === row.portal.key)
    if (s) add(s.points[i]!, row)
  }
  let first = points.findIndex((p) => p.articles > 0)
  let last = points.length - 1 - [...points].reverse().findIndex((p) => p.articles > 0)
  if (first < 0) first = last = -1
  const keep = <T,>(list: T[]) => (first < 0 ? [] : list.slice(first, last + 1))

  return {
    period: { days, from: from.toISOString(), to: to.toISOString() },
    focus: focusNode ? { id: focusNode.id, name: focusNode.name, hasChildren: Boolean(focusNode.children?.length) } : null,
    totals,
    breakdown,
    sources,
    trend: {
      bucketHours,
      points: keep(points).map(({ t, counts, analyzed }) => ({ t, counts, analyzed })),
      series: series.map((s) => ({ ...s, points: keep(s.points) })),
    },
    articles: pickDiverse(selected, 12).map(toCard),
  }
}

/** Filter tree with article counts and contributing portals for the period. */
export function summarizeCategories(rows: ArticleRow[], days: number, now = Date.now()) {
  const { from, to } = periodRange(days, now)
  const counts = new Map<string, number>()
  const sources = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.publishedAt || row.publishedAt < from || row.publishedAt > to) continue
    const leaf = leafOf(row)
    for (const id of new Set([leaf, rootOf(leaf)])) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
      const set = sources.get(id) ?? new Set()
      set.add(row.portal.key)
      sources.set(id, set)
    }
  }
  const describe = (id: string, name: string) => ({
    id,
    name,
    articles: counts.get(id) ?? 0,
    sources: [...(sources.get(id) ?? [])].sort(),
  })
  return TAXONOMY.map((root) => ({
    ...describe(root.id, root.name),
    children: root.children?.map((c) => describe(c.id, c.name)),
  })).filter((root) => root.id !== 'lainnya' || root.articles > 0)
}

/**
 * Articles in the period, from the in-memory db-sample. The period ends where the data ends (the
 * newest article), so a snapshot keeps showing its last days instead of going empty over time.
 */
export function loadRows(days: number) {
  const end = dataEnd()
  const { from, to } = periodRange(days, end)
  return {
    end,
    rows: articles.filter((a) => a.publishedAt && a.publishedAt >= from && a.publishedAt <= to) as ArticleRow[],
  }
}
