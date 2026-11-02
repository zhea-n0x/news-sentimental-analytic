import { Hono } from 'hono'
import { datasetInfo } from '../db'
import { loadRows, PERIODS, summarize, summarizeCategories } from '../services/analysis'
import { sentimentStatus } from '../services/sentiment'

export const analysisRoutes = new Hono()

const DEFAULT_DAYS = 7
const parseDays = (value: unknown) => {
  const n = Number(value)
  return PERIODS.includes(n as (typeof PERIODS)[number]) ? n : DEFAULT_DAYS
}

/** Filter tree for the frontend: unified categories with article counts for the period. */
analysisRoutes.get('/categories', (c) => {
  const days = parseDays(c.req.query('days'))
  const { rows, end } = loadRows(days)
  return c.json({ days, periods: PERIODS, total: rows.length, categories: summarizeCategories(rows, days, end) })
})

/**
 * The dashboard for one filter selection.
 *
 * Body: { categories?: string[]   unified category ids (roots or children); empty = all
 *         days?: 1 | 3 | 7 | 30    counted back from the newest article }
 *
 * Only reads: articles are analysed from the Redis queue as they are scraped. Poll GET /analysis/status and
 * call this again when its counts change to pick up new results.
 */
analysisRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
  const categories = Array.isArray(body.categories) ? body.categories.filter((x: unknown) => typeof x === 'string') : []
  const days = parseDays(body.days)

  const { rows, end } = loadRows(days)
  return c.json({ ...summarize(rows, categories, days, end), dataset: datasetInfo() })
})

/** Progress of the analysis queue, and how many articles are analysed overall. */
analysisRoutes.get('/status', async (c) => c.json({ ...(await sentimentStatus()), dataset: datasetInfo() }))
