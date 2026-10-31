import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import {
  extractBlocks,
  jsonLdText,
  metaReader,
  parseDate,
  parseIndonesianDate,
  readJsonLd,
  splitTags,
  titleCase,
} from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const BASE_URL = 'https://www.sindonews.com'
const INDEX_URL = `${BASE_URL}/indeks/0`
const PAGE_SIZE = 20
const MAX_INDEX_PAGES = 30
// Article URLs look like https://nasional.sindonews.com/read/1766817/15/slug-1793427020
const ARTICLE_URL = /^https:\/\/[a-z]+\.sindonews\.com\/read\/(\d+)\/\d+\//

// Channel slugs from the page's dataLayer, mapped to the names used on the site
const CHANNEL_NAMES: Record<string, string> = {
  international: 'Internasional',
}

export const sindonewsScraper: PortalScraper = {
  portal: {
    key: 'sindonews',
    name: 'SINDOnews',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    for (let page = 0; page < MAX_INDEX_PAGES; page++) {
      const offset = page ? `/${page * PAGE_SIZE}` : ''
      const html = await fetchPage(`${INDEX_URL}${offset}?t=${date}`)
      if (!html) break
      const $ = cheerio.load(html)
      const items = $('.list-article')

      items.each((_, el) => {
        const link = $(el).find('.title-article a[href]').first()
        const href = link.attr('href')
        if (!href) return
        const url = canonicalUrl(href)
        if (!ARTICLE_URL.test(url) || found.has(url)) return
        found.set(url, {
          url,
          title: cleanText(link.text()),
          label: cleanText($(el).find('.sub-kanal a').first().text()) || null,
        })
      })

      if (items.length < PAGE_SIZE) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // showpage=all returns multi-page articles in one response (the first page can be just the lead)
    const html = await fetchHtml(`${url}?showpage=all`)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    const title = prop('og:title') ?? cleanText($('h1.detail-title').text())
    // Paragraphs are separated by <br><br> rather than <p>
    const content = extractBlocks($, '#detail-desc', {
      remove: ['.img-content, .editor, .paging-artikel'],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // dataLayer slug, e.g. kanal: 'ekonomi_bisnis'
    const channel = /\bkanal:\s*'([a-z_-]+)'/.exec(html)?.[1]
    // The article's JSON-LD is not always served, so fall back to the visible date line
    const publishedAt =
      parseDate(/"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1]) ??
      parseIndonesianDate($('.detail-date-artikel').first().text())
    const breadcrumb = $('.breadcrumb li a')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .slice(1)

    return {
      externalId: ARTICLE_URL.exec(url)?.[1] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: channel ? (CHANNEL_NAMES[channel] ?? titleCase(channel)) : null,
      subcategory: breadcrumb.at(-1) ?? null,
      tags: splitTags(meta('keywords')),
      author: cleanText($('.detail-nama-redaksi a').first().text()) || jsonLdText(ld?.author),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt,
    } satisfies ScrapedArticle
  },
}
