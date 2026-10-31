import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, metaReader, parseDate, readJsonLdBreadcrumb, splitTags, titleCase } from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from './types'

const BASE_URL = 'https://www.cnbcindonesia.com'
const INDEX_URL = `${BASE_URL}/indeks`
// 10 items per page; a busy day is ~280 items
const MAX_INDEX_PAGES = 60
// Article URLs look like /news/20261030184130-4-781046/slug
const ARTICLE_PATH = /^\/([a-z-]+)\/\d{14}-\d+-(\d+)\//
const MEDIA_SECTIONS = new Set(['video', 'tv', 'foto', 'infografis', 'cnbc-tv'])

export const cnbcIndonesiaScraper: PortalScraper = {
  portal: {
    key: 'cnbc-indonesia',
    name: 'CNBC Indonesia',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
      const html = await fetchPage(`${INDEX_URL}?date=${date.replaceAll('-', '/')}&page=${page}`)
      if (!html) break
      const $ = cheerio.load(html)
      const items = $('.nhl-list article a[href]')
      const before = found.size

      items.each((_, el) => {
        const $el = $(el)
        const href = $el.attr('href')
        if (!href) return
        const url = canonicalUrl(href, BASE_URL)
        const match = ARTICLE_PATH.exec(new URL(url).pathname)
        const title = cleanText($el.find('h2').text())
        if (!match || found.has(url) || MEDIA_SECTIONS.has(match[1]!) || /^video\s*:/i.test(title)) return
        found.set(url, {
          url,
          title,
          label: cleanText($el.find('span.text-cnbc-primary-blue').first().text()) || null,
        })
      })

      if (!items.length || (found.size === before && page > 1)) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)

    // e.g. "singlepagevideo", "verticalvideo"
    const contentType = meta('dtk:contenttype') ?? meta('contenttype')
    if (contentType?.includes('video')) throw new SkipArticle(contentType)

    const title = prop('og:title') ?? cleanText($('h1.detail-title').text())
    // The body container is nested (.detail-text > .detail-text); the innermost one holds the paragraphs
    const content = extractBlocks($, '.detail-text:not(:has(.detail-text))', {
      remove: ['table, center, .read-full-article, a.embed, [id^="div-gpt-ad"]', 'div:has(> [id^="div-gpt-ad"])'],
      skip: [/^\[Gambas:.*\]$/i],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // JSON-LD breadcrumb: "CNBC Indonesia" > "Market" > "Berita Market"; the last level is a generic label, not a subcategory
    const breadcrumb = readJsonLdBreadcrumb($)
    const subcategory = breadcrumb[1] && !/^(berita|video)\b/i.test(breadcrumb[1]) ? breadcrumb[1] : null

    return {
      externalId: meta('dtk:articleid') ?? ARTICLE_PATH.exec(new URL(url).pathname)?.[2] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: breadcrumb[0] ?? titleCase(meta('dtk:namakanal')),
      subcategory,
      tags: splitTags(meta('dtk:keywords') ?? meta('keywords')),
      author: meta('dtk:author') ?? meta('author'),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(Number(meta('dtk:publishdateunix')) || meta('dtk:publishdate')),
    } satisfies ScrapedArticle
  },
}
