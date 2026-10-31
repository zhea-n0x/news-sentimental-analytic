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

  // The scraper writes new articles into db-sample's files, so it needs its own explicit opt-in.
  // (The old SCRAPE_ENABLED setting is ignored: it was written for MongoDB.)
  scrapeEnabled: flag(env.SCRAPE_INTO_DB_SAMPLE, false),
  // Every hour on the hour, evaluated in `timezone`
  scrapeCron: env.SCRAPE_CRON ?? '0 * * * *',
  timezone: env.SCRAPE_TIMEZONE ?? 'Asia/Jakarta',
  scrapeOnStart: flag(env.SCRAPE_ON_START, true),
  // Also re-check the previous N days so headlines published right before midnight are not missed
  lookbackDays: Number(env.SCRAPE_LOOKBACK_DAYS ?? 1),
  concurrency: Number(env.SCRAPE_CONCURRENCY ?? 3),
  requestDelayMs: Number(env.SCRAPE_DELAY_MS ?? 500),

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
      // Context window Ollama loads the model with; its 4096 default is too small for a batch
      ollamaNumCtx: Number(env.OLLAMA_NUM_CTX ?? 8192),
      model: env.GEMMA_MODEL || (provider === 'ollama' ? 'gemma4:e4b' : 'gemma-4-26b-a4b-it'),
      // Articles per request; each article is sent as title, description and the start of the text.
      // Smaller for Ollama so one request stays well under the timeout on a laptop
      batchSize: Math.max(1, Number(env.GEMMA_BATCH_SIZE || (provider === 'ollama' ? 5 : 10))),
      // Requests per minute, kept under the API key's rate limit
      requestsPerMinute: Math.max(1, Number(env.GEMMA_RPM ?? 15)),
      // Characters of article text sent per article
      excerptChars: Number(env.GEMMA_EXCERPT_CHARS ?? 700),
    }
  })(),
  // Most articles one filter request queues for analysis (newest first)
  analysisBatchLimit: Number(env.ANALYSIS_QUEUE_LIMIT ?? 100),
}
