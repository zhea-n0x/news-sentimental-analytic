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
  concurrency: Number(env.SCRAPE_CONCURRENCY ?? 3),
  requestDelayMs: Number(env.SCRAPE_DELAY_MS ?? 500),
}
