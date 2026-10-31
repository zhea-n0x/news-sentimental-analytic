const env = Bun.env

export const config = {
  port: Number(env.PORT ?? 3000),
  mongoUri: env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017',
  mongoDb: env.MONGODB_DB ?? 'news_sentiment',
  // Every hour on the hour, evaluated in `timezone`
  scrapeCron: env.SCRAPE_CRON ?? '0 * * * *',
  timezone: env.SCRAPE_TIMEZONE ?? 'Asia/Jakarta',
  scrapeOnStart: env.SCRAPE_ON_START !== 'false',
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
}
