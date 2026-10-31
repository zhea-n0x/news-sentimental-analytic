// The local database: the db-sample folder, loaded into memory at startup. No MongoDB.
//
// - Articles, portals, categories, scrape runs and skipped URLs come from db-sample's mongoexport files.
// - Gemma's results are appended to sentiments.jsonl (one JSON line per analysed article), so the
//   backup's own files are never rewritten by analysis.
// - Only the scraper (off unless SCRAPE_INTO_DB_SAMPLE=true) adds to the backup files themselves.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ObjectId } from 'bson'
import { config } from './config'
import {
  appendDocuments,
  readCollection,
  readManifest,
  rewriteCollection,
  updateManifestCounts,
} from './services/seed'
import type { Article, ArticleSentiment, Category, CategoryRef, Portal, ScrapeRun, SkippedUrl } from './types'

export type StoredArticle = Article & { _id: string }
export type StoredPortal = Portal & { _id: string }
export type StoredCategory = Category & { _id: string }
export type StoredScrapeRun = ScrapeRun & { _id: string }

export const dbDir = () => resolve(config.dbSampleDir)
export const sentimentFile = () => resolve(config.sentimentFile || join(dbDir(), 'sentiments.jsonl'))

/** 'ready' once db-sample is loaded; 'failed' (see dbError) when it could not be read. */
export let dbState: 'ready' | 'failed' = 'failed'
export let dbError: string | null = 'not loaded yet'

export const articles: StoredArticle[] = []
export const portals = new Map<string, StoredPortal>()
export const categories = new Map<string, StoredCategory>()
export const scrapeRuns: StoredScrapeRun[] = []
const articleById = new Map<string, StoredArticle>()
const articleUrls = new Set<string>()
const skippedUrls = new Map<string, SkippedUrl>()

let backupCreatedAt: string | null = null
let latestPublished = 0

const categoryKey = (portalKey: string, parentSlug: string | null, slug: string) =>
  `${portalKey}|${parentSlug ?? ''}|${slug}`
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const newId = () => new ObjectId().toHexString()

function addArticle(doc: StoredArticle) {
  articles.push(doc)
  articleById.set(doc._id, doc)
  articleUrls.add(doc.url)
  const t = doc.publishedAt?.getTime() ?? 0
  // Ignore dates in the future (bad parses) when working out where the data ends
  if (t > latestPublished && t <= Date.now() + 3_600_000) latestPublished = t
}

/** Loads db-sample. Never throws: problems end in dbState 'failed' with dbError set. */
export function loadDb() {
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
    const analysed = loadSentiments()

    dbState = 'ready'
    dbError = null
    console.log(
      `[db] loaded ${articles.length} articles from ${dir} (${analysed} already analysed, results in ${sentimentFile()})`,
    )
  } catch (err) {
    dbState = 'failed'
    dbError = message(err)
    console.error(`[db] could not load db-sample: ${dbError}`)
  }
}

function loadSentiments() {
  const file = sentimentFile()
  if (!existsSync(file)) return 0
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const { articleId, label, score, reason, model, analyzedAt } = JSON.parse(line)
      const article = articleById.get(articleId)
      if (article) article.sentiment = { label, score, reason, model, analyzedAt: new Date(analyzedAt) }
    } catch {
      // A line cut short by a crash; the article is simply analysed again
    }
  }
  return articles.filter((a) => a.sentiment).length
}

/** Where the data ends: the newest article (or now, if that is earlier). Periods count back from here. */
export const dataEnd = () => Math.min(Date.now(), latestPublished || Date.now())

export function datasetInfo() {
  return {
    name: 'db-sample',
    articles: articles.length,
    exportedAt: backupCreatedAt,
    latestArticleAt: latestPublished ? new Date(latestPublished).toISOString() : null,
  }
}

export const getArticle = (id: string) => articleById.get(id)

// ---- Sentiment (Gemma) ----

/** Stores analysis results on the articles and appends them to sentiments.jsonl. */
export function saveSentiments(results: { id: string; sentiment: ArticleSentiment }[]) {
  const lines: string[] = []
  for (const { id, sentiment } of results) {
    const article = articleById.get(id)
    if (!article) continue
    article.sentiment = sentiment
    lines.push(JSON.stringify({ articleId: id, ...sentiment, analyzedAt: sentiment.analyzedAt.toISOString() }))
  }
  if (lines.length) appendFileSync(sentimentFile(), lines.join('\n') + '\n')
}

/** Counts a failed analysis (kept in memory, so failed articles get fresh attempts after a restart). */
export function recordSentimentFailure(id: string) {
  const article = articleById.get(id)
  if (article) article.sentimentAttempts = (article.sentimentAttempts ?? 0) + 1
}

// ---- Scraper writes (only when SCRAPE_INTO_DB_SAMPLE=true) ----

export const hasArticle = (url: string) => articleUrls.has(url)
export const isSkippedUrl = (url: string) => skippedUrls.has(url)

/** Adds a scraped article unless its URL is already stored. Returns whether it was new. */
export function insertArticle(doc: Article) {
  if (articleUrls.has(doc.url)) return false
  const stored: StoredArticle = { ...doc, _id: newId() }
  addArticle(stored)
  appendDocuments(dbDir(), 'articles', [stored])
  return true
}

export function addSkippedUrl(entry: SkippedUrl) {
  if (skippedUrls.has(entry.url)) return
  skippedUrls.set(entry.url, entry)
  appendDocuments(dbDir(), 'skipped_urls', [{ ...entry, _id: newId() }])
}

let portalsChanged = false
let categoriesChanged = false

export function upsertPortal(portal: Pick<Portal, 'key' | 'name' | 'url' | 'indexUrl'>) {
  const now = new Date()
  const existing = portals.get(portal.key)
  portals.set(portal.key, existing ? { ...existing, ...portal, updatedAt: now } : { ...portal, _id: newId(), createdAt: now, updatedAt: now })
  portalsChanged = true
}

export function markPortalScraped(key: string) {
  const portal = portals.get(key)
  if (!portal) return
  portal.lastScrapedAt = new Date()
  portalsChanged = true
}

export function upsertCategory(portalKey: string, ref: CategoryRef, parentSlug: string | null) {
  const now = new Date()
  const key = categoryKey(portalKey, parentSlug, ref.slug)
  const existing = categories.get(key)
  categories.set(
    key,
    existing
      ? { ...existing, name: ref.name, updatedAt: now }
      : { _id: newId(), portalKey, parentSlug, slug: ref.slug, name: ref.name, createdAt: now, updatedAt: now },
  )
  categoriesChanged = true
}

/** Registers a run; the same object is updated as the scrape progresses, so GET /scrape/runs shows live counts. */
export function startScrapeRun(run: ScrapeRun) {
  const stored = Object.assign(run, { _id: newId() })
  scrapeRuns.push(stored)
  return stored._id
}

/** Saves a finished run and writes everything the run changed back to db-sample. */
export function finishScrapeRun(id: string, run: ScrapeRun) {
  const index = scrapeRuns.findIndex((r) => r._id === id)
  const stored = { ...run, _id: id }
  if (index >= 0) scrapeRuns[index] = stored
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
