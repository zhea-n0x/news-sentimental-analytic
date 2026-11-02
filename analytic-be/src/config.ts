const env = Bun.env

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : value !== 'false' && value !== '0'

export const config = {
  port: Number(env.PORT ?? 4000),
  // Origin of analytic-fe, allowed by CORS (the frontend normally goes through its own /api proxy)
  frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:3000',

  // The database: MongoDB first. If it cannot be reached at startup, the db-sample folder is used instead
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: env.MONGODB_DB || 'news_sentiment',
  // How long to wait for MongoDB at startup before falling back to db-sample
  mongoConnectTimeoutMs: Number(env.MONGODB_CONNECT_TIMEOUT_MS || 3000),

  // The fallback: a mongoexport backup folder, read into memory
  dbSampleDir: env.DB_SAMPLE_DIR || '../db-sample',
  // Gemma's results in db-sample mode, one JSON line per article; defaults to <DB_SAMPLE_DIR>/sentiments.jsonl.
  // With MongoDB, results not yet in the database are imported from it at startup
  sentimentFile: env.SENTIMENT_FILE || '',

  // Scraping into MongoDB (on by default, as before db-sample existed)
  scrapeEnabled: flag(env.SCRAPE_ENABLED, true),
  // Scraping while on the db-sample fallback writes into its files, so it needs its own explicit opt-in
  scrapeIntoDbSample: flag(env.SCRAPE_INTO_DB_SAMPLE, false),
  // Every hour on the hour, evaluated in `timezone`
  scrapeCron: env.SCRAPE_CRON ?? '0 * * * *',
  timezone: env.SCRAPE_TIMEZONE ?? 'Asia/Jakarta',
  scrapeOnStart: flag(env.SCRAPE_ON_START, true),
  // Also re-check the previous N days so headlines published right before midnight are not missed
  lookbackDays: Number(env.SCRAPE_LOOKBACK_DAYS ?? 1),
  userAgent:
    env.SCRAPE_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  // Article pages fetched in parallel per portal (requests to one site are still spaced out, see below)
  concurrency: Number(env.SCRAPE_CONCURRENCY ?? 2),
  // Minimum gap between two requests to the same site, plus a random extra of up to requestJitterMs.
  // A longer Crawl-delay in the site's robots.txt takes precedence.
  requestIntervalMs: Number(env.SCRAPE_REQUEST_INTERVAL_MS ?? 1500),
  requestJitterMs: Number(env.SCRAPE_REQUEST_JITTER_MS ?? 1000),
  // Cron runs start each portal at a random point in this window instead of all at the same second
  startJitterMs: Number(env.SCRAPE_START_JITTER_MINUTES ?? 10) * 60_000,
  // A portal's run stops early after this many 403/429 responses in a row (a bot challenge stops it at once)
  maxBlockedResponses: Number(env.SCRAPE_MAX_BLOCKED_RESPONSES ?? 3),

  // Sentiment analysis with Gemma: a local Ollama server, or the Gemini API (Google AI Studio).
  // Defaults to Ollama unless GEMINI_API_KEY is set
  gemma: (() => {
    const apiKey = env.GEMINI_API_KEY ?? ''
    const provider = (env.GEMMA_PROVIDER || (apiKey ? 'gemini' : 'ollama')) as 'ollama' | 'gemini'
    return {
      provider,
      configured: provider === 'ollama' || Boolean(apiKey),
      apiKey,
      apiUrl: env.GEMMA_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
      ollamaUrl: (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
      // Context window Ollama loads the model with; big enough for a batch of whole articles.
      // The article text in one request is trimmed to fit it
      ollamaNumCtx: Number(env.OLLAMA_NUM_CTX ?? 16384),
      model: env.GEMMA_MODEL || (provider === 'ollama' ? 'gemma4:e2b' : 'gemma-4-26b-a4b-it'),
      // Articles per request; each article is sent as title, description and the start of the text.
      // Smaller for Ollama so one request stays well under the timeout on a laptop
      batchSize: Math.max(1, Number(env.GEMMA_BATCH_SIZE || (provider === 'ollama' ? 5 : 10))),
      // Requests per minute, kept under the API key's rate limit
      requestsPerMinute: Math.max(1, Number(env.GEMMA_RPM ?? 15)),
      // Most characters of article text sent per article. With Ollama this covers whole articles;
      // the Gemini API keeps a short excerpt to stay under its tokens-per-minute limit
      excerptChars: Number(env.GEMMA_EXCERPT_CHARS || (provider === 'ollama' ? 30000 : 700)),
    }
  })(),
  // Most articles one filter request queues for analysis (newest first)
  analysisBatchLimit: Number(env.ANALYSIS_QUEUE_LIMIT ?? 100),
}
