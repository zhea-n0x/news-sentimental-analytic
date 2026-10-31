import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { config } from './config'
import { initDb } from './db'
import { startScheduler } from './jobs/scheduler'
import { articleRoutes } from './routes/articles'
import { portalRoutes } from './routes/portals'
import { scrapeRoutes } from './routes/scrape'
import { scrapeAllPortals } from './services/scrape'

await initDb()

const app = new Hono()

app.use(logger())

app.get('/', (c) => c.json({ name: 'analytic-be', status: 'ok' }))

app.route('/portals', portalRoutes)
app.route('/articles', articleRoutes)
app.route('/scrape', scrapeRoutes)

startScheduler()
if (config.scrapeOnStart) {
  scrapeAllPortals('startup').catch((err) => console.error('[startup] scrape failed', err))
}

export default {
  port: config.port,
  fetch: app.fetch,
}
