import { Hono } from 'hono'
import { config } from '../config'
import { datasetInfo } from '../db'
import { loadRows, PERIODS, summarize, summarizeCategories } from '../services/analysis'
import { enqueue, sentimentStatus } from '../services/sentiment'

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
 *         days?: 1 | 3 | 7 | 30    counted back from the newest article in db-sample
 *         analyze?: 'auto' | 'all' | 'none' }
 *
 * Aggregates the articles that match, and queues the ones Gemma has not analysed yet ('auto' queues
 * the newest ANALYSIS_QUEUE_LIMIT, 'all' up to 1000, 'none' only reads). Call again (with
 * analyze: 'none') while `analysis.pending` is above zero to pick up new results.
 */
analysisRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
  const categories = Array.isArray(body.categories) ? body.categories.filter((x: unknown) => typeof x === 'string') : []
  const days = parseDays(body.days)
  const mode = body.analyze === 'all' || body.analyze === 'none' ? body.analyze : 'auto'

  const { rows, end } = loadRows(days)
  const summary = summarize(rows, categories, days, end)
  const limit = mode === 'all' ? 1000 : mode === 'none' ? 0 : config.analysisBatchLimit
  const queued = enqueue(summary.unanalyzed.slice(0, limit))
  const { unanalyzed, ...rest } = summary

  return c.json({
    ...rest,
    dataset: datasetInfo(),
    analysis: { ...sentimentStatus(), queued, remaining: unanalyzed.length },
  })
})

/** Progress of the analysis queue. */
analysisRoutes.get('/status', (c) => c.json({ ...sentimentStatus(), dataset: datasetInfo() }))
