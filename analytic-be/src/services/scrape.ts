import { config } from '../config'
import {
  addSkippedUrl,
  finishScrapeRun,
  hasArticle,
  insertArticle,
  isSkippedUrl,
  markPortalScraped,
  startScrapeRun,
  upsertCategory,
  upsertPortal,
} from '../db'
import { titleCase } from '../lib/html'
import { BlockedError, HttpError } from '../lib/http'
import { RobotsDisallowedError, RobotsUnavailableError } from '../lib/robots'
import { cleanText, mapLimit, recentDates, slugify, titleKey } from '../lib/utils'
import { scrapers } from '../scrapers'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from '../scrapers/types'
import type { Article, CategoryRef, ScrapeRun, ScrapeTrigger } from '../types'
import { checkPortalAccess, saveAccess, type AccessCheck } from './access'

const UNCATEGORIZED: CategoryRef = { name: 'Uncategorized', slug: 'uncategorized' }

// Portals with a scrape in progress, so a manual trigger cannot overlap the cron job
const running = new Set<string>()

export function isScraping(portalKey: string) {
  return running.has(portalKey)
}

// Portals are different sites, so they run in parallel; requests to one site are spaced out by the throttle
export async function scrapeAllPortals(trigger: ScrapeTrigger) {
  return Promise.all(
    scrapers.map(async (scraper) => {
      // Spread cron runs over a few minutes instead of hitting every portal at the top of the hour
      if (trigger === 'cron' && config.startJitterMs > 0) await Bun.sleep(Math.random() * config.startJitterMs)
      return scrapePortal(scraper, trigger)
    }),
  )
}

export async function scrapePortal(scraper: PortalScraper, trigger: ScrapeTrigger) {
  const { portal } = scraper
  if (running.has(portal.key)) return null
  running.add(portal.key)

  const run: ScrapeRun = {
    portalKey: portal.key,
    trigger,
    status: 'running',
    dates: recentDates(scraper.todayOnly ? 0 : config.lookbackDays, config.timezone),
    listed: 0,
    inserted: 0,
    skipped: 0,
    duplicates: 0,
    ignored: 0,
    failed: 0,
    errors: [],
    startedAt: new Date(),
  }
  const runId = startScrapeRun(run)
  console.log(`[scrape:${portal.key}] started (${trigger}) for ${run.dates.join(', ')}`)
  let access: AccessCheck | null = null

  try {
    upsertPortal({ key: portal.key, name: portal.name, url: portal.url, indexUrl: portal.indexUrl })

    // robots.txt is re-read on every run; a portal that no longer allows its index is paused, not scraped
    access = await checkPortalAccess(scraper)
    if (access.status !== 'ok') {
      run.status = 'skipped'
      run.errors.push({ message: access.reason ?? access.status })
      return { ...run, _id: insertedId }
    }

    // Feeds and sitemaps reach back days or months; only keep what falls inside the lookback window
    const cutoff = Date.now() - (config.lookbackDays + 1) * 86_400_000
    const listed = new Map<string, ListedArticle>()
    for (const date of run.dates) {
      for (const item of await scraper.listArticles(date)) {
        if (item.publishedAt && item.publishedAt.getTime() < cutoff) continue
        listed.set(item.url, item)
      }
    }
    run.listed = listed.size

    // Skip articles already stored (or known not to be articles) before spending a request on them
    const urls = [...listed.keys()]
    const existing = urls.filter(hasArticle)
    const ignored = urls.filter(isSkippedUrl)
    const known = new Set([...existing, ...ignored])
    run.skipped = existing.length
    run.ignored = ignored.length
    const fresh = [...listed.values()].filter((item) => !known.has(item.url))

    await mapLimit(fresh, config.concurrency, async (item) => {
      if (stopReason) return
      try {
        const scraped = await scraper.scrapeArticle(item.url)
        blockedInARow = 0
        const doc = toArticle(scraper, item, scraped)
        if (insertArticle(doc)) {
          run.inserted++
          saveCategories(portal.key, doc.category, doc.subcategory)
        } else {
          run.skipped++
        }
      } catch (err) {
        if (err instanceof SkipArticle || err instanceof RobotsDisallowedError) {
          run.ignored++
          addSkippedUrl({ url: item.url, portalKey: portal.key, reason: err.message, createdAt: new Date() })
        } else {
          run.failed++
          run.errors.push({ url: item.url, message: errorMessage(err) })
        }
      }
    })

    run.status = 'success'
    markPortalScraped(portal.key)
  } catch (err) {
    run.status = 'failed'
    run.errors.push({ message: errorMessage(err) })
    // A listing page refused by robots.txt or by bot protection also changes the portal's access status
    if (access && err instanceof RobotsDisallowedError) {
      access = { ...access, status: 'disallowed', reason: err.message, disallowedUrls: [err.url] }
    } else if (access && err instanceof RobotsUnavailableError) {
      access = { ...access, status: err.kind === 'blocked' ? 'blocked' : 'unreachable', reason: err.message }
    } else if (access && err instanceof BlockedError) {
      access = { ...access, status: 'blocked', reason: err.message }
    }
  } finally {
    if (access) await saveAccess(portal.key, access)
    run.finishedAt = new Date()
    finishScrapeRun(runId, run)
    running.delete(portal.key)
    console.log(
      `[scrape:${portal.key}] ${run.status}: listed=${run.listed} inserted=${run.inserted} skipped=${run.skipped} ` +
        `duplicates=${run.duplicates} ignored=${run.ignored} failed=${run.failed}`,
    )
  }

  return { ...run, _id: runId }
}

/**
 * Drops listed items that must not be fetched, before any request is made: URLs already stored or remembered as
 * non-articles, and titles this portal already published recently under another URL (or twice in this listing).
 */
async function filterNew(portalKey: string, items: ListedArticle[], run: ScrapeRun) {
  const urls = items.map((item) => item.url)
  const keys = [...new Set(items.map((item) => titleKey(item.title)).filter((key) => key !== null))]
  // Only recent titles count: recurring headlines ("Harga Emas Antam Hari Ini") are new articles on another day
  const since = new Date(Date.now() - (config.lookbackDays + 2) * 86_400_000)

  const [existing, ignored, sameTitle] = await Promise.all([
    articles.find({ url: { $in: urls } }, { projection: { url: 1 } }).toArray(),
    skippedUrls.find({ url: { $in: urls } }, { projection: { url: 1 } }).toArray(),
    articles
      .find(
        { 'portal.key': portalKey, titleKeys: { $in: keys }, scrapedAt: { $gte: since } },
        { projection: { titleKeys: 1 } },
      )
      .toArray(),
  ])
  run.skipped = existing.length
  run.ignored = ignored.length

  const knownUrls = new Set([...existing, ...ignored].map((doc) => doc.url))
  const knownTitles = new Set(sameTitle.flatMap((doc) => doc.titleKeys))
  const fresh: ListedArticle[] = []
  for (const item of items) {
    if (knownUrls.has(item.url)) continue
    const key = titleKey(item.title)
    if (key && knownTitles.has(key)) {
      run.duplicates++
      continue
    }
    if (key) knownTitles.add(key)
    fresh.push(item)
  }
  return fresh
}

async function rememberSkipped(portalKey: string, url: string, reason: string) {
  await skippedUrls.updateOne(
    { url },
    { $setOnInsert: { url, portalKey, reason, createdAt: new Date() } },
    { upsert: true },
  )
}

function toArticle(scraper: PortalScraper, item: ListedArticle, scraped: ScrapedArticle): Article {
  const { key, name, url } = scraper.portal
  const category = toCategoryRef(scraped.category ?? item.label) ?? UNCATEGORIZED
  let subcategory = toCategoryRef(scraped.subcategory)
  // Some sections repeat the category as subcategory (e.g. "Tren / Tren"); treat that as no subcategory
  if (subcategory?.slug === category.slug) subcategory = null

  return {
    url: item.url,
    externalId: scraped.externalId,
    portal: { key, name, url },
    title: scraped.title || item.title,
    titleKeys: [...new Set([titleKey(scraped.title), titleKey(item.title)].filter((key) => key !== null))],
    description: scraped.description,
    content: scraped.content,
    category,
    subcategory,
    tags: scraped.tags,
    author: scraped.author,
    editor: scraped.editor,
    imageUrl: scraped.imageUrl,
    publishedAt: scraped.publishedAt,
    wordCount: scraped.content.split(/\s+/).filter(Boolean).length,
    scrapedAt: new Date(),
  }
}

function toCategoryRef(value: string | null | undefined): CategoryRef | null {
  let name = cleanText(value)
  // Some portals only expose lowercase slugs-as-names ("life"); keep proper casing otherwise ("e-Business", "AI")
  if (name === name.toLowerCase()) name = titleCase(name) ?? name
  const slug = slugify(name)
  return slug ? { name, slug } : null
}

function saveCategories(portalKey: string, category: CategoryRef, subcategory: CategoryRef | null) {
  upsertCategory(portalKey, category, null)
  if (subcategory) upsertCategory(portalKey, subcategory, category.slug)
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}
