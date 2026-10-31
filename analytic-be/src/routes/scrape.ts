import { Hono } from 'hono'
import { config } from '../config'
import { scrapeRuns } from '../db'
import { getScraper, scrapers } from '../scrapers'
import { isScraping, scrapePortal } from '../services/scrape'

export const scrapeRoutes = new Hono()

// Starts a scrape in the background; poll GET /scrape/runs for the result
scrapeRoutes.post('/run', (c) => {
  if (!config.scrapeEnabled) {
    return c.json({ error: 'Scraping is off. Set SCRAPE_ENABLED=true to add new articles to db-sample.' }, 409)
  }
  const key = c.req.query('portal')
  const targets = key ? [getScraper(key)].filter((s) => s !== undefined) : scrapers
  if (!targets.length) return c.json({ error: `Unknown portal "${key}"` }, 404)

  const busy = targets.filter((s) => isScraping(s.portal.key)).map((s) => s.portal.key)
  if (busy.length === targets.length) return c.json({ error: 'Scrape already running', portals: busy }, 409)

  Promise.all(targets.map((scraper) => scrapePortal(scraper, 'manual'))).catch((err) =>
    console.error('[scrape] manual run failed', err),
  )

  return c.json({ started: targets.map((s) => s.portal.key).filter((k) => !busy.includes(k)) }, 202)
})

scrapeRoutes.get('/runs', (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 20))
  const portal = c.req.query('portal')
  const runs = scrapeRuns
    .filter((r) => !portal || r.portalKey === portal)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit)
  return c.json(runs)
})
