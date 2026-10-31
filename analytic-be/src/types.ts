// Documents as stored in db-sample (mongoexport files). `_id` is kept as a 24-character hex string.

export interface CategoryRef {
  name: string
  slug: string
}

export interface PortalRef {
  key: string
  name: string
  url: string
}

export interface Portal extends PortalRef {
  _id?: string
  indexUrl: string
  access?: PortalAccess
  createdAt: Date
  updatedAt: Date
  lastScrapedAt?: Date
}

/**
 * Whether we may (still) scrape a portal, refreshed on every run.
 * - ok: robots.txt allows everything we fetch
 * - partial: some article URLs are disallowed by robots.txt and were skipped
 * - disallowed: robots.txt disallows the portal's index; scraping is paused until it allows it again
 * - unreachable: robots.txt could not be read (server/network error); treated as disallowed for that run
 * - blocked: the site answered with a bot challenge or repeated 403/429; the run was stopped
 */
export type AccessStatus = 'ok' | 'partial' | 'disallowed' | 'unreachable' | 'blocked'

export interface PortalAccess {
  status: AccessStatus
  reason: string | null
  // Sample of URLs robots.txt disallowed (index or articles)
  disallowedUrls: string[]
  // AI crawler user agents the portal shuts out in robots.txt (informational; see src/lib/robots.ts)
  aiCrawlersDisallowed: string[]
  checkedAt: Date
  // When the status last changed
  since: Date
}

export interface Category extends CategoryRef {
  _id?: string
  portalKey: string
  // null for a top-level category, otherwise the slug of its parent category
  parentSlug: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Article {
  _id?: string
  url: string
  externalId: string | null
  portal: PortalRef
  title: string
  // Normalized titles (article page + index listing) used to spot the same story under another URL
  titleKeys: string[]
  description: string | null
  // Plain text, paragraphs separated by a blank line
  content: string
  category: CategoryRef
  subcategory: CategoryRef | null
  tags: string[]
  author: string | null
  editor: string | null
  imageUrl: string | null
  publishedAt: Date | null
  wordCount: number
  scrapedAt: Date
  // Set once Gemma has analysed the article
  sentiment?: ArticleSentiment | null
  // Failed analysis attempts; articles are not retried after MAX_SENTIMENT_ATTEMPTS
  sentimentAttempts?: number
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative'

export interface ArticleSentiment {
  label: SentimentLabel
  // -1 (very negative) to 1 (very positive)
  score: number
  // One short sentence from the model explaining the label
  reason: string
  model: string
  analyzedAt: Date
}

export interface SkippedUrl {
  url: string
  portalKey: string
  reason: string
  createdAt: Date
}

export type ScrapeTrigger = 'cron' | 'manual' | 'startup'

export interface ScrapeRun {
  _id?: string
  portalKey: string
  trigger: ScrapeTrigger
  // skipped: not scraped because of the portal's access status (robots.txt / bot protection)
  status: 'running' | 'success' | 'failed' | 'skipped'
  dates: string[]
  listed: number
  inserted: number
  skipped: number
  // Not fetched because an article with the same title was scraped recently under another URL
  duplicates: number
  // Pages that turned out not to be text articles (see SkipArticle) or that robots.txt disallows
  ignored: number
  failed: number
  errors: { url?: string; message: string }[]
  startedAt: Date
  finishedAt?: Date
}
