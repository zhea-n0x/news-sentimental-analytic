import { config } from '../config'
import { articles, categories, portals, scrapeRuns, skippedUrls } from '../db'
import { titleCase } from '../lib/html'
import { cleanText, mapLimit, recentDates, slugify } from '../lib/utils'
import { scrapers } from '../scrapers'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from '../scrapers/types'
import type { Article, CategoryRef, ScrapeRun, ScrapeTrigger } from '../types'

const UNCATEGORIZED: CategoryRef = { name: 'Uncategorized', slug: 'uncategorized' }

// Portals with a scrape in progress, so a manual trigger cannot overlap the cron job
const running = new Set<string>()

export function isScraping(portalKey: string) {
  return running.has(portalKey)
}

// Portals are different hosts, so they run in parallel; each portal still limits its own request rate
export async function scrapeAllPortals(trigger: ScrapeTrigger) {
  return Promise.all(scrapers.map((scraper) => scrapePortal(scraper, trigger)))
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
    ignored: 0,
    failed: 0,
    errors: [],
    startedAt: new Date(),
  }
  const { insertedId } = await scrapeRuns.insertOne(run)
  console.log(`[scrape:${portal.key}] started (${trigger}) for ${run.dates.join(', ')}`)

  try {
    const now = new Date()
    await portals.updateOne(
      { key: portal.key },
      {
        $set: { name: portal.name, url: portal.url, indexUrl: portal.indexUrl, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    )

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
    const [existing, ignored] = await Promise.all([
      articles.find({ url: { $in: urls } }, { projection: { url: 1 } }).toArray(),
      skippedUrls.find({ url: { $in: urls } }, { projection: { url: 1 } }).toArray(),
    ])
    const known = new Set([...existing, ...ignored].map((doc) => doc.url))
    run.skipped = existing.length
    run.ignored = ignored.length
    const fresh = [...listed.values()].filter((item) => !known.has(item.url))

    await mapLimit(fresh, config.concurrency, async (item) => {
      try {
        const scraped = await scraper.scrapeArticle(item.url)
        const doc = toArticle(scraper, item, scraped)
        const res = await articles.updateOne({ url: doc.url }, { $setOnInsert: doc }, { upsert: true })
        if (res.upsertedCount) {
          run.inserted++
          await saveCategories(portal.key, doc.category, doc.subcategory)
        } else {
          run.skipped++
        }
      } catch (err) {
        if (err instanceof SkipArticle) {
          run.ignored++
          await skippedUrls.updateOne(
            { url: item.url },
            { $setOnInsert: { url: item.url, portalKey: portal.key, reason: err.message, createdAt: new Date() } },
            { upsert: true },
          )
        } else {
          run.failed++
          run.errors.push({ url: item.url, message: errorMessage(err) })
        }
      }
      await Bun.sleep(config.requestDelayMs)
    })

    run.status = 'success'
    await portals.updateOne({ key: portal.key }, { $set: { lastScrapedAt: new Date() } })
  } catch (err) {
    run.status = 'failed'
    run.errors.push({ message: errorMessage(err) })
  } finally {
    run.finishedAt = new Date()
    await scrapeRuns.replaceOne({ _id: insertedId }, run)
    running.delete(portal.key)
    console.log(
      `[scrape:${portal.key}] ${run.status}: listed=${run.listed} inserted=${run.inserted} skipped=${run.skipped} ignored=${run.ignored} failed=${run.failed}`,
    )
  }

  return { ...run, _id: insertedId }
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

async function saveCategories(portalKey: string, category: CategoryRef, subcategory: CategoryRef | null) {
  const now = new Date()
  const upsert = (ref: CategoryRef, parentSlug: string | null) =>
    categories.updateOne(
      { portalKey, parentSlug, slug: ref.slug },
      { $set: { name: ref.name, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    )

  await upsert(category, null)
  if (subcategory) await upsert(subcategory, category.slug)
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}
