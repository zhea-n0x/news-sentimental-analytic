import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, metaReader, parseDate, readJsonLd, splitTags, jsonLdText } from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const BASE_URL = 'https://www.okezone.com'
const INDEX_URL = 'https://index.okezone.com/bydate/index'
const PAGE_SIZE = 15
// A busy day is ~220 items
const MAX_INDEX_PAGES = 40
// Article URLs look like https://news.okezone.com/read/2026/10/31/337/3251291/slug
const ARTICLE_URL = /^https:\/\/([a-z-]+)\.okezone\.com\/read\/\d{4}\/\d{2}\/\d{2}\/\d+\/(\d+)\//

export const okezoneScraper: PortalScraper = {
  portal: {
    key: 'okezone',
    name: 'Okezone',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    for (let page = 0; page < MAX_INDEX_PAGES; page++) {
      const html = await fetchPage(`${INDEX_URL}/${date.replaceAll('-', '/')}/${page * PAGE_SIZE}/`)
      if (!html) break
      const $ = cheerio.load(html)
      const items = $('li.idx-list')

      items.each((_, el) => {
        const link = $(el).find('h4 a[href]').first()
        const href = link.attr('href')
        if (!href) return
        const url = canonicalUrl(href)
        // The by-date index also lists photo/video/infographic items under other paths
        if (!ARTICLE_URL.test(url) || found.has(url)) return
        found.set(url, {
          url,
          title: cleanText(link.text()),
          label: cleanText($(el).find('time.category-hardnews a').first().text()) || null,
        })
      })

      if (items.length < PAGE_SIZE) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // page=all returns multi-page articles in a single response
    const html = await fetchHtml(`${url}?page=all`)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    // og:title carries a " - PAGE ALL : Okezone Economy" suffix on page=all
    const title = jsonLdText(ld?.headline) ?? cleanText($('h1').first().text())
    const content = extractBlocks($, '.c-detail.read', {
      remove: ['[id="baca-juga"], .text.baca, .group-baca, .vicon, div[style*="page-break"], #paging'],
      // Channel footer, e.g. "Ekonomi Okezone menyajikan berita ekonomi terkini..."
      skip: [/okezone (memberikan|menyajikan)/i],
      title,
    })
    if (!content) throw new Error('Article content not found')

    return {
      externalId: ARTICLE_URL.exec(url)?.[2] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: prop('article:section'),
      subcategory: prop('article:section2'),
      tags: splitTags(meta('meta_keywords') ?? meta('keywords')),
      author: prop('dable:author') ?? jsonLdText(ld?.author),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(prop('article:published_time') ?? jsonLdText(ld?.datePublished)),
    } satisfies ScrapedArticle
  },
}
