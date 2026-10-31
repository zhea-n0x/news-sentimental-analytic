import { MongoClient } from 'mongodb'
import { config } from './config'
import { titleKey } from './lib/utils'
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
  // One createIndexes command per collection; indexes that already exist with the same spec are left as they are
  await Promise.all([
    portals.createIndexes([{ key: { key: 1 }, unique: true }]),
    categories.createIndexes([{ key: { portalKey: 1, parentSlug: 1, slug: 1 }, unique: true }]),
    articles.createIndexes([
      // The unique url index is what keeps articles distinct across hourly runs
      { key: { url: 1 }, unique: true },
      { key: { 'portal.key': 1, publishedAt: -1 } },
      { key: { 'category.slug': 1, publishedAt: -1 } },
      { key: { publishedAt: -1 } },
      { key: { 'portal.key': 1, titleKeys: 1 } },
    ]),
    scrapeRuns.createIndexes([{ key: { portalKey: 1, startedAt: -1 } }]),
    skippedUrls.createIndexes([
      { key: { url: 1 }, unique: true },
      // Indexes only look back a day or two, so old skip records can expire
      { key: { createdAt: 1 }, expireAfterSeconds: 14 * 86_400 },
    ]),
  ])

  // Articles stored before title matching existed get their titleKeys once
  const missing = await articles.find({ titleKeys: { $exists: false } }, { projection: { title: 1 } }).toArray()
  if (missing.length) {
    await articles.bulkWrite(
      missing.map(({ _id, title }) => ({
        updateOne: { filter: { _id }, update: { $set: { titleKeys: [titleKey(title)].filter((key) => key !== null) } } },
      })),
    )
    console.log(`[db] added titleKeys to ${missing.length} existing articles`)
  }
}
