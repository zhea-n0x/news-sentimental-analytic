import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, jsonLdText, metaReader, parseDate, readJsonLd, splitTags } from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const BASE_URL = 'https://www.tribunnews.com'
const INDEX_URL = `${BASE_URL}/index-news`
// The index only serves the latest 10 pages (~200 items, roughly the last 18 hours); deeper pages repeat page 10
const MAX_INDEX_PAGES = 10
// Article URLs look like https://www.tribunnews.com/nasional/7904923/slug
const ARTICLE_URL = /^https:\/\/www\.tribunnews\.com\/([a-z0-9-]+)\/(\d+)\/[^/]+$/
const MEDIA_SECTIONS = new Set(['video', 'tribunnews-video', 'foto', 'tribunnewswiki'])

export const tribunnewsScraper: PortalScraper = {
  portal: {
    key: 'tribunnews',
    name: 'Tribunnews',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },
  // The index ignores its date parameter and always lists the latest articles
  todayOnly: true,

  async listArticles() {
    const found = new Map<string, ListedArticle>()

    for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
      const html = await fetchPage(`${INDEX_URL}?page=${page}`)
      if (!html) break
      const $ = cheerio.load(html)
      const items = $('ul.lsi > li')
      const before = found.size

      items.each((_, el) => {
        const link = $(el).find('h3 a[href]').first()
        const href = link.attr('href')
        if (!href) return
        const url = canonicalUrl(href)
        const match = ARTICLE_URL.exec(url)
        if (!match || found.has(url) || MEDIA_SECTIONS.has(match[1]!)) return
        // Video items carry a play icon in the title link
        if (link.find('i[class*="play"]').length) return
        found.set(url, { url, title: cleanText(link.attr('title') ?? link.text()), label: null })
      })

      if (found.size === before || !$('a[rel="next"]').length) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // page=all returns multi-page articles in a single response
    const html = await fetchHtml(`${url}?page=all`)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    const title = jsonLdText(ld?.headline) ?? prop('og:title') ?? cleanText($('h1').first().text())
    const content = extractBlocks($, '.side-article.txt-article', {
      remove: ['blockquote.summary-article, .ads-placeholder, figure, p.baca, .paging, [id^="div-gpt-ad"]'],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // Breadcrumb: Home > Nasional > Politik
    const breadcrumb = $('ul.breadcrumb li a')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .slice(1)

    return {
      externalId: ARTICLE_URL.exec(url)?.[2] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: breadcrumb[0] ?? jsonLdText(ld?.articleSection),
      subcategory: breadcrumb[1] ?? null,
      tags: splitTags(ld?.keywords ?? meta('news_keywords') ?? meta('keywords')),
      author: jsonLdText(ld?.author) ?? (cleanText($('#penulis a').first().text()) || null),
      editor: jsonLdText(ld?.editor) ?? (cleanText($('#editor a').first().text()) || null),
      imageUrl: prop('og:image'),
      publishedAt: parseDate(jsonLdText(ld?.datePublished) ?? prop('article:published_time')),
    } satisfies ScrapedArticle
  },
}
