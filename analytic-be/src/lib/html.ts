import * as cheerio from 'cheerio'
import { cleanText } from './utils'

// Private-use character that never appears in article text
const BLOCK_SEPARATOR = ''

const BLOCK_TAGS = 'p, h1, h2, h3, h4, h5, h6, li, div, section, article, blockquote, figure, br, tr'

// e.g. "Jakarta -", "JAKARTA, KOMPAS.com -", "Jakarta, CNN Indonesia --"
const DATELINE = /^.{1,60}\s(-{1,2}|–|—)$/u

const RELATED_LINK = /^\s*(baca|lihat|simak) (juga|pula)\b\s*[:-]?/i
const TRAILING_RELATED_LINK = /(?<=[.!?"”])\s+(Baca|Lihat|Simak) (juga|pula)\s*:.*$/

// Boilerplate lines shared by most Indonesian portals
const COMMON_SKIP = [
  RELATED_LINK,
  /^(baca|lihat|simak|cek) berita\b.*[:-]/i,
  /^(advertisement|scroll to continue( with content)?|iklan)$/i,
  // Editor/source credits on their own line, e.g. "(kdf/kid)", "(antara/isn)", "(Anindita Trinoviana)" or "(*)"
  /^\([\p{L}\s.'/*-]{1,40}\)$/u,
]

export function metaReader($: cheerio.CheerioAPI) {
  return {
    name: (name: string) => cleanText($(`meta[name="${name}"]`).attr('content')) || null,
    prop: (name: string) => cleanText($(`meta[property="${name}"]`).attr('content')) || null,
  }
}

interface ExtractOptions {
  /** Selectors removed before reading text (ads, related links, captions...) */
  remove?: string[]
  /** Extra lines to drop, on top of the common "Baca juga"/ads/initials patterns */
  skip?: RegExp[]
  /** Drop a block equal to the article title (multi-page cards repeat it) */
  title?: string | null
  /** A dateline block merged into the paragraph after it; defaults to a short block ending in a dash ("Jakarta -") */
  dateline?: RegExp
}

/**
 * Plain-text paragraphs of an article body, separated by a blank line.
 * Block boundaries come from the markup, so text not wrapped in <p> (a common lead-sentence pattern) is kept.
 */
export function extractBlocks($: cheerio.CheerioAPI, root: string, options: ExtractOptions = {}) {
  const body = $(root).first()
  if (!body.length) return ''

  body
    .find(['script, style, noscript, iframe, img, svg, button, form, video, audio, figcaption', ...(options.remove ?? [])].join(', '))
    .remove()
  // Related-article links are often inline, e.g. "...paragraph. <strong>Baca juga: <a>...</a></strong>"
  body.find('strong, b, em, span, p, div, li').each((_, el) => {
    const text = $(el).text()
    if (text.length < 400 && RELATED_LINK.test(text)) $(el).remove()
  })
  body.find(BLOCK_TAGS).each((_, el) => {
    $(el).before(BLOCK_SEPARATOR).after(BLOCK_SEPARATOR)
  })

  const skip = [...COMMON_SKIP, ...(options.skip ?? [])]
  const blocks: string[] = []
  for (const raw of body.text().split(BLOCK_SEPARATOR)) {
    // Plain-text related link at the end of a paragraph: "...sentence. Baca juga: Other headline"
    const text = cleanText(raw).replace(TRAILING_RELATED_LINK, '')
    if (!text || text === options.title || skip.some((pattern) => pattern.test(text))) continue
    const last = blocks.at(-1)
    if (last && (options.dateline ?? DATELINE).test(last)) blocks[blocks.length - 1] = `${last} ${text}`
    else blocks.push(text)
  }

  return blocks.join('\n\n')
}

export interface FeedItem {
  url: string
  title: string
  publishedAt: Date | null
}

/** Items of an RSS feed or a (news) sitemap. */
export function parseFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xml: true })
  const rss = $('item')
    .map((_, el) => ({
      url: cleanText($(el).children('link').text()) || cleanText($(el).children('guid').text()),
      title: cleanText($(el).children('title').text()),
      publishedAt: parseDate($(el).children('pubDate').text()),
    }))
    .get()
  const sitemap = $('url')
    .map((_, el) => ({
      url: cleanText($(el).children('loc').text()),
      title: cleanText($(el).find('news\\:title').text()),
      publishedAt: parseDate(cleanText($(el).find('news\\:publication_date').text()) || null),
    }))
    .get()
  return [...rss, ...sitemap].filter((item) => item.url)
}

type JsonLd = Record<string, unknown>

/** First JSON-LD object whose @type is one of `types` (searches arrays and @graph). */
export function readJsonLd($: cheerio.CheerioAPI, types = ['NewsArticle', 'Article', 'ReportageNewsArticle']) {
  const matches = (node: JsonLd) => {
    const type = node['@type']
    return Array.isArray(type) ? type.some((t) => types.includes(t)) : types.includes(type as string)
  }
  const visit = (node: unknown): JsonLd | null => {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = visit(item)
        if (found) return found
      }
      return null
    }
    if (!node || typeof node !== 'object') return null
    const obj = node as JsonLd
    if (matches(obj)) return obj
    return obj['@graph'] ? visit(obj['@graph']) : null
  }

  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      // Some portals emit raw newlines/tabs inside JSON strings
      const found = visit(JSON.parse($(el).text().replace(/[\u0000-\u001f]+/g, ' ')))
      if (found) return found
    } catch {
      // Malformed JSON-LD is common; ignore that block
    }
  }
  return null
}

/** Names from a JSON-LD BreadcrumbList, without the leading home item. */
export function readJsonLdBreadcrumb($: cheerio.CheerioAPI) {
  const list = readJsonLd($, ['BreadcrumbList'])
  const items = Array.isArray(list?.itemListElement) ? (list.itemListElement as JsonLd[]) : []
  return items
    .toSorted((a, b) => Number(a.position) - Number(b.position))
    .map((item) => jsonLdText(item.name) ?? jsonLdText(item.item))
    .slice(1)
    .filter((name): name is string => Boolean(name))
}

/** Text value of a JSON-LD field that may be a string, an object with `name`, or an array of either. */
export function jsonLdText(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(jsonLdText).filter(Boolean).join(', ') || null
  if (value && typeof value === 'object') return jsonLdText((value as JsonLd).name)
  return typeof value === 'string' ? cleanText(value) || null : null
}

export function splitTags(value: unknown, separator: string | RegExp = ',') {
  let list: string[] = []
  if (Array.isArray(value)) list = value.map(String)
  else if (typeof value === 'string') list = value.split(separator)
  return [...new Set(list.map((tag) => cleanText(tag)).filter(Boolean))]
}

export function titleCase(value: string | null | undefined) {
  if (!value) return null
  return cleanText(value.replaceAll('-', ' ').replaceAll('_', ' ')).replace(/\b\p{L}/gu, (char) => char.toUpperCase())
}

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
}
const ZONES: Record<string, string> = { WIB: '+07:00', WITA: '+08:00', WIT: '+09:00' }

/** Parses human dates such as "Sabtu, 31 Oktober 2026 - 13:44 WIB" or "30 Okt 2026, 23:53" (WIB unless stated). */
export function parseIndonesianDate(text: string | null | undefined) {
  const match = text && /(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\D+?(\d{1,2})[:.](\d{2})(?:\s*(WIB|WITA|WIT))?/i.exec(text)
  const month = match && MONTHS[match[2]!.toLowerCase()]
  if (!match || !month) return null
  const pad = (value: string | number) => String(value).padStart(2, '0')
  const zone = ZONES[match[6]?.toUpperCase() ?? 'WIB']
  const date = new Date(`${match[3]}-${pad(month)}-${pad(match[1]!)}T${pad(match[4]!)}:${match[5]}:00${zone}`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Parses a date; strings without a timezone such as "2026/10/31 00:30:30" are read as WIB (UTC+7). */
export function parseDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value)
  const local = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(value.trim())
  const date = local
    ? new Date(`${local[1]}-${local[2]}-${local[3]}T${local[4]}${local[5] ?? ':00'}+07:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
