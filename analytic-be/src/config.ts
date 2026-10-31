const env = Bun.env

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : value !== 'false' && value !== '0'

export const config = {
  port: Number(env.PORT ?? 4000),
  // Origin of analytic-fe, allowed by CORS (the frontend normally goes through its own /api proxy)
  frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:3000',

  // The local database: the db-sample folder (a mongoexport backup), read at startup. No MongoDB.
  dbSampleDir: env.DB_SAMPLE_DIR || '../db-sample',
  // Gemma's results, one JSON line per article; defaults to <DB_SAMPLE_DIR>/sentiments.jsonl
  sentimentFile: env.SENTIMENT_FILE || '',

  // The scraper adds new articles to db-sample's files. Off unless SCRAPE_ENABLED=true.
  scrapeEnabled: flag(env.SCRAPE_ENABLED, false),
  // Every hour on the hour, evaluated in `timezone`
  scrapeCron: env.SCRAPE_CRON ?? '0 * * * *',
  timezone: env.SCRAPE_TIMEZONE ?? 'Asia/Jakarta',
  scrapeOnStart: flag(env.SCRAPE_ON_START, true),
  // Also re-check the previous N days so headlines published right before midnight are not missed
  lookbackDays: Number(env.SCRAPE_LOOKBACK_DAYS ?? 1),
  concurrency: Number(env.SCRAPE_CONCURRENCY ?? 3),
  requestDelayMs: Number(env.SCRAPE_DELAY_MS ?? 500),

  // Sentiment analysis with Gemma through the Gemini API (Google AI Studio)
  gemma: {
    apiKey: env.GEMINI_API_KEY ?? '',
    apiUrl: env.GEMMA_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
    model: env.GEMMA_MODEL ?? 'gemma-4-26b-a4b-it',
    // Articles per request; each article is sent as title, description and the start of the text
    batchSize: Math.max(1, Number(env.GEMMA_BATCH_SIZE ?? 10)),
    // Requests per minute, kept under the API key's rate limit
    requestsPerMinute: Math.max(1, Number(env.GEMMA_RPM ?? 15)),
    // Characters of article text sent per article
    excerptChars: Number(env.GEMMA_EXCERPT_CHARS ?? 700),
  },
  // Most articles one filter request queues for analysis (newest first)
  analysisBatchLimit: Number(env.ANALYSIS_QUEUE_LIMIT ?? 100),
}
