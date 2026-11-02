// The database: MongoDB first, the db-sample folder as fallback. Either way it is read into memory at startup.
//
// - MongoDB (MONGODB_URI / MONGODB_DB) is tried first. When it answers, its collections are loaded (articles
//   without their text, which is read on demand) and every change is written back to it. Gemma results that
//   only exist in sentiments.jsonl (from running on db-sample) are imported into it.
// - When it does not answer within MONGODB_CONNECT_TIMEOUT_MS, the db-sample folder (a mongoexport backup) is
//   loaded instead. Gemma's results are then appended to sentiments.jsonl, and only the scraper (off unless
//   SCRAPE_INTO_DB_SAMPLE=true) adds to the backup files themselves.
// - Routes read the in-memory copy, so documents another process writes to MongoDB show after a restart.
import { existsSync, appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MongoClient, MongoServerError, ObjectId, type Collection } from 'mongodb'
import { config } from './config'
import { titleKey } from './lib/utils'
import {
  appendDocuments,
  readCollection,
  readManifest,
  rewriteCollection,
  updateManifestCounts,
} from './services/seed'
import type {
  Article,
  ArticleSentiment,
  Category,
  CategoryRef,
  Portal,
  PortalAccess,
  ScrapeRun,
  SkippedUrl,
} from './types'

export type StoredArticle = Article & { _id: string }
/** An article as kept in memory: with MongoDB its text stays in the database (see withContent). */
export type CachedArticle = Omit<StoredArticle, 'content'> & { content?: string }
export type StoredPortal = Portal & { _id: string }
export type StoredCategory = Category & { _id: string }
export type StoredScrapeRun = ScrapeRun & { _id: string }

export const dbDir = () => resolve(config.dbSampleDir)
export const sentimentFile = () => resolve(config.sentimentFile || join(dbDir(), 'sentiments.jsonl'))

/** 'ready' once a source is loaded; 'failed' (see dbError) when neither could be read. */
export let dbState: 'ready' | 'failed' = 'failed'
export let dbError: string | null = 'not loaded yet'
/** Where the data was loaded from. */
export let dbSource: 'mongodb' | 'db-sample' | null = null
/** Why MongoDB is not in use (null while it is). */
export let mongoError: string | null = null

export const articles: CachedArticle[] = []
export const portals = new Map<string, StoredPortal>()
export const categories = new Map<string, StoredCategory>()
export const scrapeRuns: StoredScrapeRun[] = []
const articleById = new Map<string, CachedArticle>()
const articleUrls = new Set<string>()
const skippedUrls = new Map<string, SkippedUrl>()

let backupCreatedAt: string | null = null
let latestPublished = 0

// Most recent scrape runs read from MongoDB at startup (GET /scrape/runs shows at most 100)
const SCRAPE_RUNS_LOADED = 1000

type InMongo<T extends { _id: string }> = Omit<T, '_id'> & { _id: ObjectId }

let mongo: {
  client: MongoClient
  articles: Collection<InMongo<StoredArticle>>
  portals: Collection<InMongo<StoredPortal>>
  categories: Collection<InMongo<StoredCategory>>
  scrapeRuns: Collection<InMongo<StoredScrapeRun>>
  skippedUrls: Collection<SkippedUrl & { _id?: ObjectId }>
} | null = null

const categoryKey = (portalKey: string, parentSlug: string | null, slug: string) =>
  `${portalKey}|${parentSlug ?? ''}|${slug}`
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const newId = () => new ObjectId().toHexString()
const fromMongo = <T extends { _id: ObjectId }>({ _id, ...rest }: T) => ({ ...rest, _id: _id.toHexString() })
const toMongo = <T extends { _id: string }>({ _id, ...rest }: T) => ({ ...rest, _id: new ObjectId(_id) })
// Credentials in the URI are not logged
const redact = (uri: string) => uri.replace(/\/\/[^@/]*@/, '//<credentials>@')

function addArticle(doc: CachedArticle) {
  // Articles stored before title matching existed get their titleKeys here
  doc.titleKeys ??= [titleKey(doc.title)].filter((key) => key !== null)
  articles.push(doc)
  articleById.set(doc._id, doc)
  articleUrls.add(doc.url)
  const t = doc.publishedAt?.getTime() ?? 0
  // Ignore dates in the future (bad parses) when working out where the data ends
  if (t > latestPublished && t <= Date.now() + 3_600_000) latestPublished = t
}

function dropArticle(doc: CachedArticle) {
  const index = articles.lastIndexOf(doc)
  if (index >= 0) articles.splice(index, 1)
  articleById.delete(doc._id)
  articleUrls.delete(doc.url)
}

function clearMemory() {
  articles.length = 0
  scrapeRuns.length = 0
  for (const store of [portals, categories, articleById, articleUrls, skippedUrls]) store.clear()
  backupCreatedAt = null
  latestPublished = 0
}

/** Loads MongoDB, or db-sample when MongoDB cannot be reached. Never throws: see dbState and dbError. */
export async function loadDb() {
  try {
    await loadFromMongo()
    return
  } catch (err) {
    mongoError = message(err)
    console.warn(`[db] MongoDB at ${redact(config.mongoUri)} is not available (${mongoError}); falling back to db-sample`)
    await mongo?.client.close().catch(() => {})
    mongo = null
    clearMemory()
  }
  loadFromDbSample()
}

async function loadFromMongo() {
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: config.mongoConnectTimeoutMs })
  const db = client.db(config.mongoDb)
  mongo = {
    client,
    articles: db.collection('articles'),
    portals: db.collection('portals'),
    categories: db.collection('categories'),
    scrapeRuns: db.collection('scrape_runs'),
    skippedUrls: db.collection('skipped_urls'),
  }
  await client.connect()
  await ensureIndexes()
  const imported = await importSentimentFile()

  const [articleDocs, portalDocs, categoryDocs, skippedDocs, runDocs] = await Promise.all([
    mongo.articles.find({}, { projection: { content: 0 } }).toArray(),
    mongo.portals.find().toArray(),
    mongo.categories.find().toArray(),
    mongo.skippedUrls.find({}, { projection: { _id: 0 } }).toArray(),
    mongo.scrapeRuns.find().sort({ startedAt: -1 }).limit(SCRAPE_RUNS_LOADED).toArray(),
  ])
  for (const doc of articleDocs) addArticle(fromMongo(doc))
  for (const doc of portalDocs) portals.set(doc.key, fromMongo(doc))
  for (const doc of categoryDocs) categories.set(categoryKey(doc.portalKey, doc.parentSlug, doc.slug), fromMongo(doc))
  for (const doc of skippedDocs) skippedUrls.set(doc.url, doc)
  for (const doc of runDocs.reverse()) scrapeRuns.push(fromMongo(doc))

  dbSource = 'mongodb'
  dbState = 'ready'
  dbError = mongoError = null
  const analysed = articles.filter((a) => a.sentiment).length
  console.log(
    `[db] loaded ${articles.length} articles from MongoDB ${config.mongoDb} at ${redact(config.mongoUri)} ` +
      `(${analysed} already analysed${imported ? `, ${imported} imported from ${sentimentFile()}` : ''})`,
  )
}

/** Indexes the scraper relies on. A clash with an existing index is logged, not fatal. */
async function ensureIndexes() {
  if (!mongo) return
  try {
    // One createIndexes command per collection; indexes that already exist with the same spec are left as they are
    await Promise.all([
      mongo.portals.createIndexes([{ key: { key: 1 }, unique: true }]),
      mongo.categories.createIndexes([{ key: { portalKey: 1, parentSlug: 1, slug: 1 }, unique: true }]),
      mongo.articles.createIndexes([
        // The unique url index is what keeps articles distinct across hourly runs
        { key: { url: 1 }, unique: true },
        { key: { 'portal.key': 1, publishedAt: -1 } },
        { key: { 'category.slug': 1, publishedAt: -1 } },
        { key: { publishedAt: -1 } },
        { key: { 'portal.key': 1, titleKeys: 1 } },
      ]),
      mongo.scrapeRuns.createIndexes([{ key: { portalKey: 1, startedAt: -1 } }]),
      mongo.skippedUrls.createIndexes([
        { key: { url: 1 }, unique: true },
        // Indexes only look back a day or two, so old skip records can expire
        { key: { createdAt: 1 }, expireAfterSeconds: 14 * 86_400 },
      ]),
    ])
  } catch (err) {
    console.warn(`[db] could not create MongoDB indexes: ${message(err)}`)
  }
}

/** Gemma's results from sentiments.jsonl, the last line per article winning. */
function readSentimentFile() {
  const results = new Map<string, ArticleSentiment>()
  const file = sentimentFile()
  if (!existsSync(file)) return results
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const { articleId, label, score, reason, model, analyzedAt } = JSON.parse(line)
      results.set(articleId, { label, score, reason, model, analyzedAt: new Date(analyzedAt) })
    } catch {
      // A line cut short by a crash; the article is simply analysed again
    }
  }
  return results
}

/** Copies results saved while running on db-sample to MongoDB articles that have none yet. */
async function importSentimentFile() {
  if (!mongo) return 0
  const results = [...readSentimentFile()].filter(([id]) => ObjectId.isValid(id))
  if (!results.length) return 0
  const res = await mongo.articles.bulkWrite(
    results.map(([id, sentiment]) => ({
      updateOne: { filter: { _id: new ObjectId(id), sentiment: null }, update: { $set: { sentiment } } },
    })),
    { ordered: false },
  )
  return res.modifiedCount
}

function loadFromDbSample() {
  try {
    const dir = dbDir()
    if (!existsSync(join(dir, 'articles.json'))) {
      throw new Error(`no db-sample at ${dir} (articles.json is missing); set DB_SAMPLE_DIR`)
    }
    for (const doc of readCollection(dir, 'articles')) addArticle(doc as StoredArticle)
    for (const doc of readCollection(dir, 'portals')) portals.set(doc.key, doc as StoredPortal)
    for (const doc of readCollection(dir, 'categories')) {
      categories.set(categoryKey(doc.portalKey, doc.parentSlug, doc.slug), doc as StoredCategory)
    }
    for (const doc of readCollection(dir, 'skipped_urls')) skippedUrls.set(doc.url, doc as SkippedUrl)
    for (const doc of readCollection(dir, 'scrape_runs')) scrapeRuns.push(doc as StoredScrapeRun)
    backupCreatedAt = readManifest(dir)?.createdAt ?? null
    for (const [id, sentiment] of readSentimentFile()) {
      const article = articleById.get(id)
      if (article) article.sentiment = sentiment
    }

    dbSource = 'db-sample'
    dbState = 'ready'
    dbError = null
    const analysed = articles.filter((a) => a.sentiment).length
    console.log(
      `[db] loaded ${articles.length} articles from ${dir} (${analysed} already analysed, results in ${sentimentFile()})`,
    )
  } catch (err) {
    dbState = 'failed'
    dbError = `MongoDB: ${mongoError}; db-sample: ${message(err)}`
    console.error(`[db] could not load db-sample: ${message(err)}`)
  }
}

/** Where the data ends: the newest article (or now, if that is earlier). Periods count back from here. */
export const dataEnd = () => Math.min(Date.now(), latestPublished || Date.now())

export function datasetInfo() {
  return {
    name: dbSource === 'mongodb' ? 'MongoDB' : 'db-sample',
    source: dbSource,
    articles: articles.length,
    exportedAt: backupCreatedAt,
    latestArticleAt: latestPublished ? new Date(latestPublished).toISOString() : null,
    // Why the db-sample backup is used instead of MongoDB
    fallbackReason: dbSource === 'db-sample' ? mongoError : null,
  }
}

/** Whether the scraper may run: into MongoDB unless SCRAPE_ENABLED=false, into db-sample only when opted in. */
export const scrapingEnabled = () => (dbSource === 'mongodb' ? config.scrapeEnabled : config.scrapeIntoDbSample)

/** An article without its text when the data is in MongoDB. */
export const getArticle = (id: string) => articleById.get(id)

/** Articles with their text (read from MongoDB when it is the source), in the order of `ids`. */
export async function withContent(ids: string[]): Promise<StoredArticle[]> {
  const docs = ids.map((id) => articleById.get(id)).filter((a) => a !== undefined)
  const missing = docs.filter((a) => a.content === undefined)
  if (mongo && missing.length) {
    const found = await mongo.articles
      .find({ _id: { $in: missing.map((a) => new ObjectId(a._id)) } }, { projection: { content: 1 } })
      .toArray()
    const text = new Map(found.map((doc) => [doc._id.toHexString(), doc.content]))
    return docs.map((a) => ({ ...a, content: a.content ?? text.get(a._id) ?? '' }))
  }
  return docs.map((a) => ({ ...a, content: a.content ?? '' }))
}

// ---- Sentiment (Gemma) ----

/** Stores analysis results on the articles, in MongoDB or appended to sentiments.jsonl. */
export async function saveSentiments(results: { id: string; sentiment: ArticleSentiment }[]) {
  const saved = results.filter(({ id }) => articleById.has(id))
  for (const { id, sentiment } of saved) articleById.get(id)!.sentiment = sentiment
  if (!saved.length) return
  if (mongo) {
    await mongo.articles.bulkWrite(
      saved.map(({ id, sentiment }) => ({
        updateOne: { filter: { _id: new ObjectId(id) }, update: { $set: { sentiment } } },
      })),
      { ordered: false },
    )
    return
  }
  const lines = saved.map(({ id, sentiment }) =>
    JSON.stringify({ articleId: id, ...sentiment, analyzedAt: sentiment.analyzedAt.toISOString() }),
  )
  appendFileSync(sentimentFile(), lines.join('\n') + '\n')
}

/** Counts a failed analysis (kept in memory, so failed articles get fresh attempts after a restart). */
export function recordSentimentFailure(id: string) {
  const article = articleById.get(id)
  if (article) article.sentimentAttempts = (article.sentimentAttempts ?? 0) + 1
}

// ---- Scraper writes (into MongoDB, or into db-sample when SCRAPE_INTO_DB_SAMPLE=true) ----

export const hasArticle = (url: string) => articleUrls.has(url)
export const isSkippedUrl = (url: string) => skippedUrls.has(url)

/** Normalized titles of the portal's articles scraped since `since` (to spot one story under another URL). */
export function recentTitleKeys(portalKey: string, since: Date) {
  const keys = new Set<string>()
  for (const a of articles) {
    if (a.portal.key === portalKey && a.scrapedAt >= since) for (const key of a.titleKeys) keys.add(key)
  }
  return keys
}

/** Two writers inserting the same unique key at once: the other one won, which is fine. */
const isDuplicateKey = (err: unknown) => err instanceof MongoServerError && err.code === 11000

/** Adds a scraped article unless its URL is already stored. Returns whether it was new. */
export async function insertArticle(doc: Article) {
  if (articleUrls.has(doc.url)) return false
  const stored: StoredArticle = { ...doc, _id: newId() }
  if (!mongo) {
    addArticle(stored)
    appendDocuments(dbDir(), 'articles', [stored])
    return true
  }
  const { content: _content, ...cached } = stored
  addArticle(cached)
  try {
    const res = await mongo.articles.updateOne({ url: doc.url }, { $setOnInsert: toMongo(stored) }, { upsert: true })
    if (res.upsertedCount) return true
  } catch (err) {
    dropArticle(cached)
    if (isDuplicateKey(err)) return false
    throw err
  }
  // Another process stored this URL first; it is picked up on the next start
  dropArticle(cached)
  articleUrls.add(doc.url)
  return false
}

export async function addSkippedUrl(entry: SkippedUrl) {
  if (skippedUrls.has(entry.url)) return
  skippedUrls.set(entry.url, entry)
  if (!mongo) return appendDocuments(dbDir(), 'skipped_urls', [{ ...entry, _id: newId() }])
  await mongo.skippedUrls
    .updateOne({ url: entry.url }, { $setOnInsert: entry }, { upsert: true })
    .catch((err) => { if (!isDuplicateKey(err)) throw err })
}

let portalsChanged = false
let categoriesChanged = false

export async function upsertPortal(portal: Pick<Portal, 'key' | 'name' | 'url' | 'indexUrl'>) {
  const now = new Date()
  const existing = portals.get(portal.key)
  const stored = existing
    ? { ...existing, ...portal, updatedAt: now }
    : { ...portal, _id: newId(), createdAt: now, updatedAt: now }
  portals.set(portal.key, stored)
  if (!mongo) {
    portalsChanged = true
    return
  }
  await mongo.portals.updateOne(
    { key: portal.key },
    { $set: { ...portal, updatedAt: now }, $setOnInsert: { _id: new ObjectId(stored._id), createdAt: stored.createdAt } },
    { upsert: true },
  )
}

async function updatePortal(key: string, fields: Partial<Pick<Portal, 'lastScrapedAt' | 'access'>>) {
  const portal = portals.get(key)
  if (!portal) return
  Object.assign(portal, fields)
  if (!mongo) {
    portalsChanged = true
    return
  }
  await mongo.portals.updateOne({ key }, { $set: fields })
}

export const markPortalScraped = (key: string) => updatePortal(key, { lastScrapedAt: new Date() })
export const setPortalAccess = (key: string, access: PortalAccess) => updatePortal(key, { access })

export async function upsertCategory(portalKey: string, ref: CategoryRef, parentSlug: string | null) {
  const now = new Date()
  const key = categoryKey(portalKey, parentSlug, ref.slug)
  const existing = categories.get(key)
  const stored = existing
    ? { ...existing, name: ref.name, updatedAt: now }
    : { _id: newId(), portalKey, parentSlug, slug: ref.slug, name: ref.name, createdAt: now, updatedAt: now }
  categories.set(key, stored)
  if (!mongo) {
    categoriesChanged = true
    return
  }
  await mongo.categories
    .updateOne(
      { portalKey, parentSlug, slug: ref.slug },
      { $set: { name: ref.name, updatedAt: now }, $setOnInsert: { _id: new ObjectId(stored._id), createdAt: stored.createdAt } },
      { upsert: true },
    )
    .catch((err) => { if (!isDuplicateKey(err)) throw err })
}

/** Registers a run; the same object is updated as the scrape progresses, so GET /scrape/runs shows live counts. */
export async function startScrapeRun(run: ScrapeRun) {
  const stored = Object.assign(run, { _id: newId() })
  scrapeRuns.push(stored)
  if (mongo) await mongo.scrapeRuns.insertOne(toMongo(stored))
  return stored._id
}

/** Saves a finished run, plus (with db-sample) everything the run changed in the backup files. */
export async function finishScrapeRun(id: string, run: ScrapeRun) {
  const index = scrapeRuns.findIndex((r) => r._id === id)
  const stored = { ...run, _id: id }
  if (index >= 0) scrapeRuns[index] = stored
  if (mongo) {
    await mongo.scrapeRuns.replaceOne({ _id: new ObjectId(id) }, toMongo(stored))
    return
  }
  const dir = dbDir()
  appendDocuments(dir, 'scrape_runs', [stored])
  if (portalsChanged) rewriteCollection(dir, 'portals', [...portals.values()])
  if (categoriesChanged) rewriteCollection(dir, 'categories', [...categories.values()])
  portalsChanged = categoriesChanged = false
  updateManifestCounts(dir, {
    articles: articles.length,
    portals: portals.size,
    categories: categories.size,
    scrape_runs: scrapeRuns.length,
    skipped_urls: skippedUrls.size,
  })
}
