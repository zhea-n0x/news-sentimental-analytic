import * as cheerio from 'cheerio'
import { config } from '../config'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, jsonLdText, metaReader, parseDate, parseIndonesianDate, readJsonLd, splitTags } from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const BASE_URL = 'https://www.suara.com'
const INDEX_URL = `${BASE_URL}/indeks`
// ~15 pages a day at 20 items per page
const MAX_INDEX_PAGES = 50
// Newsroom articles look like https://www.suara.com/bisnis/2026/10/31/133500/slug; "yoursay." (user posts)
// and regional subdomains use other templates and are left out
const ARTICLE_URL = /^https:\/\/www\.suara\.com\/([a-z]+)\/\d{4}\/\d{2}\/\d{2}\/\d{6}\/[^/]+$/
// Media sections, plus "bri" which is a sponsored advertorial channel
const MEDIA_SECTIONS = new Set(['video', 'foto', 'tv', 'bri'])

export const suaraScraper: PortalScraper = {
  portal: {
    key: 'suara',
    name: 'Suara.com',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },
  // The index has no date filter; it is paged back from the latest article instead
  todayOnly: true,

  async listArticles() {
    const found = new Map<string, ListedArticle>()
    const cutoff = Date.now() - (config.lookbackDays + 1) * 86_400_000

    for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
      const html = await fetchPage(`${INDEX_URL}?page=${page}`)
      if (!html) break
      const $ = cheerio.load(html)
      const items = $('.article-kanal-item')
      let oldest = Infinity

      items.each((_, el) => {
        const link = $(el).find('.article-kanal-info h3 a[href]').first()
        const href = link.attr('href')
        if (!href) return
        const publishedAt = parseIndonesianDate($(el).find('.article-kanal-info h4').first().text())
        if (publishedAt) oldest = Math.min(oldest, publishedAt.getTime())
        const url = canonicalUrl(href)
        const match = ARTICLE_URL.exec(url)
        if (!match || MEDIA_SECTIONS.has(match[1]!) || found.has(url)) return
        found.set(url, {
          url,
          title: cleanText(link.attr('title') ?? link.text()),
          label: null,
          publishedAt,
        })
      })

      if (!items.length || oldest < cutoff) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // page=all returns multi-page articles (common for listicles) in a single response
    const html = await fetchHtml(`${url}?page=all`)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    const title = jsonLdText(ld?.headline) ?? prop('og:title') ?? cleanText($('h1').first().text())
    const content = extractBlocks($, 'div.article-content', {
      remove: [
        '.ten-second, .placeholder_belt, .placeholder_read_body, .article-read, figure',
        '.google-add-preferred-source-btn, .follow-channels-container, .pagination-custom',
      ],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // Breadcrumb: Home > Lifestyle > Female
    const breadcrumb = $('.breadcrumb li a')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .slice(1)

    return {
      externalId: null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: breadcrumb[0] ?? null,
      subcategory: breadcrumb[1] ?? null,
      tags: splitTags(meta('keywords')),
      author: cleanText($('.article-profile h3 a').first().text()) || jsonLdText(ld?.author),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(jsonLdText(ld?.datePublished) ?? prop('article:published_time')),
    } satisfies ScrapedArticle
  },
}
