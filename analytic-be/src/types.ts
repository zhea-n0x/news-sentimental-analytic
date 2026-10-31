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
  createdAt: Date
  updatedAt: Date
  lastScrapedAt?: Date
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
  status: 'running' | 'success' | 'failed'
  dates: string[]
  listed: number
  inserted: number
  skipped: number
  // Pages that turned out not to be text articles (see SkipArticle)
  ignored: number
  failed: number
  errors: { url?: string; message: string }[]
  startedAt: Date
  finishedAt?: Date
}
