import { Hono, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { config } from './config'
import { datasetInfo, dbError, dbState, loadDb, scrapingEnabled } from './db'
import { startScheduler } from './jobs/scheduler'
import { analysisRoutes } from './routes/analysis'
import { articleRoutes } from './routes/articles'
import { portalRoutes } from './routes/portals'
import { scrapeRoutes } from './routes/scrape'
import { scrapeAllPortals } from './services/scrape'

// The data comes from MongoDB, or from the db-sample folder when MongoDB cannot be reached; it is read into memory here
await loadDb()

const app = new Hono()

app.use(logger())
app.use('*', cors({ origin: config.frontendOrigin }))

app.get('/', (c) =>
  c.json({ name: 'analytic-be', status: dbState === 'ready' ? 'ok' : 'error', error: dbError, dataset: datasetInfo() }),
)

// If neither source could be read, data routes say why (503) instead of failing obscurely
const requireData: MiddlewareHandler = async (c, next) => {
  if (dbState === 'ready') return next()
  return c.json({ error: `The local database could not be loaded: ${dbError}` }, 503)
}
// "/x/*" also matches "/x" itself
for (const path of ['/portals', '/articles', '/scrape', '/analysis']) app.use(`${path}/*`, requireData)

app.route('/portals', portalRoutes)
app.route('/articles', articleRoutes)
app.route('/scrape', scrapeRoutes)
app.route('/analysis', analysisRoutes)

// Errors as JSON with the real message, so a failing route is not mistaken for the server being down
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(`[api] ${c.req.method} ${c.req.path} failed:`, err)
  return c.json({ error: err.message || 'Internal error' }, 500)
})

if (!config.gemma.configured) {
  console.warn('[sentiment] GEMINI_API_KEY is not set; articles will not be analysed')
} else {
  const where = config.gemma.provider === 'ollama' ? `Ollama at ${config.gemma.ollamaUrl}` : 'the Gemini API'
  console.log(`[sentiment] using ${config.gemma.model} via ${where}`)
}

// Scraping writes into MongoDB (unless SCRAPE_ENABLED=false); into db-sample's files only when explicitly enabled
if (dbState === 'ready' && scrapingEnabled()) {
  startScheduler()
  if (config.scrapeOnStart) {
    scrapeAllPortals('startup').catch((err) => console.error('[startup] scrape failed', err))
  }
}

console.log(`[api] listening on http://localhost:${config.port}`)

export default {
  port: config.port,
  fetch: app.fetch,
}
