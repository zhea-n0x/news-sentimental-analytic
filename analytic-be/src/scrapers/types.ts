import type { PortalRef } from '../types'

export interface ListedArticle {
  url: string
  title: string
  // Channel label shown on the index page; only used as a category fallback
  label: string | null
  // Known for feed/sitemap listings; items older than the lookback window are not fetched
  publishedAt?: Date | null
}

export interface ScrapedArticle {
  externalId: string | null
  title: string
  description: string | null
  content: string
  category: string | null
  subcategory: string | null
  tags: string[]
  author: string | null
  editor: string | null
  imageUrl: string | null
  publishedAt: Date | null
}

/** Thrown for pages that are not text articles (video, live report...); the URL is remembered and not fetched again. */
export class SkipArticle extends Error {}

export interface PortalScraper {
  portal: PortalRef & { indexUrl: string }
  /** The index only shows today's articles (no date parameter), so it is listed once per run */
  todayOnly?: boolean
  /** Distinct article URLs listed on the portal's index for one day (YYYY-MM-DD). */
  listArticles(date: string): Promise<ListedArticle[]>
  scrapeArticle(url: string): Promise<ScrapedArticle>
}
