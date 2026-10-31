import { MongoClient } from 'mongodb'
import { config } from './config'
import type { Article, Category, Portal, ScrapeRun, SkippedUrl } from './types'

export const client = new MongoClient(config.mongoUri)
export const db = client.db(config.mongoDb)

export const portals = db.collection<Portal>('portals')
export const categories = db.collection<Category>('categories')
export const articles = db.collection<Article>('articles')
export const scrapeRuns = db.collection<ScrapeRun>('scrape_runs')
export const skippedUrls = db.collection<SkippedUrl>('skipped_urls')

export async function initDb() {
  await client.connect()
  await Promise.all([
    portals.createIndex({ key: 1 }, { unique: true }),
    categories.createIndex({ portalKey: 1, parentSlug: 1, slug: 1 }, { unique: true }),
    // The unique url index is what keeps articles distinct across hourly runs
    articles.createIndex({ url: 1 }, { unique: true }),
    articles.createIndex({ 'portal.key': 1, publishedAt: -1 }),
    articles.createIndex({ 'category.slug': 1, publishedAt: -1 }),
    articles.createIndex({ publishedAt: -1 }),
    scrapeRuns.createIndex({ portalKey: 1, startedAt: -1 }),
    skippedUrls.createIndex({ url: 1 }, { unique: true }),
    // Indexes only look back a day or two, so old skip records can expire
    skippedUrls.createIndex({ createdAt: 1 }, { expireAfterSeconds: 14 * 86_400 }),
  ])
}
