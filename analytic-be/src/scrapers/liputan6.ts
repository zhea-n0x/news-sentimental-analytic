import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, jsonLdText, metaReader, parseDate, readJsonLd, splitTags } from '../lib/html'
import { canonicalUrl, cleanText, forEachChannel } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const BASE_URL = 'https://www.liputan6.com'
// Each channel has its own date index; the bare /indeks only covers News
const CHANNELS = [
  'news', 'bisnis', 'saham', 'crypto', 'bola', 'showbiz', 'hot', 'tekno', 'health',
  'regional', 'global', 'otomotif', 'lifestyle', 'islami', 'citizen6', 'cek-fakta',
]
const MAX_INDEX_PAGES = 20
// Article URLs look like https://www.liputan6.com/news/read/8325293/slug
const ARTICLE_URL = /^https:\/\/www\.liputan6\.com\/[a-z0-9-]+\/read\/(\d+)\//
const NON_ARTICLE_CHANNELS = new Set(['infografis', 'photo', 'foto', 'video', 'tv'])

export const liputan6Scraper: PortalScraper = {
  portal: {
    key: 'liputan6',
    name: 'Liputan6.com',
    url: BASE_URL,
    indexUrl: `${BASE_URL}/indeks`,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    await forEachChannel(CHANNELS, async (channel) => {
      for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
        const html = await fetchPage(`${BASE_URL}/${channel}/indeks/${date.replaceAll('-', '/')}?page=${page}`)
        if (!html) break
        const $ = cheerio.load(html)
        const items = $('article.articles--rows--item')

        items.each((_, el) => {
          const $el = $(el)
          if (NON_ARTICLE_CHANNELS.has($el.attr('data-channel-slug') ?? '')) return
          const link = $el.find('a.articles--rows--item__title-link[href]').first()
          const href = link.attr('href')
          if (!href) return
          const url = canonicalUrl(href)
          if (!ARTICLE_URL.test(url) || found.has(url)) return
          found.set(url, {
            url,
            title: cleanText(link.attr('title') ?? link.text()),
            label: cleanText($el.find('.articles--rows--item__category').first().text()) || null,
          })
        })

        // The page links overstate the page count; trust the "next" link and empty pages instead
        if (!items.length || !$('#next').length) break
      }
    })

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // Multi-page articles render every page in the first response
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    const title = jsonLdText(ld?.headline) ?? prop('og:title') ?? cleanText($('h1').first().text())
    const content = extractBlocks($, '.article-content-body', {
      remove: [
        '.baca-juga-collections, .advertisement-placeholder, .article-ad, [id^="div-revive-ad"], figure',
        'p[data-component-name="desktop:info:footnote"], p[data-component-name="mobile:info:footnote"]',
      ],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // Breadcrumb: "Liputan6" > "News" > "Peristiwa"
    const breadcrumb = $('a.read-page--breadcrumb--item__title')
      .map((_, el) => cleanText($(el).attr('data-category') ?? $(el).text()))
      .get()
      .slice(1)

    return {
      externalId: ARTICLE_URL.exec(url)?.[1] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: breadcrumb[0] ?? null,
      subcategory: breadcrumb[1] ?? null,
      tags: splitTags(meta('keywords')),
      // meta[name=author] is always "Liputan6.com"; JSON-LD has the actual writers
      author: jsonLdText(ld?.author) ?? (cleanText($('.read-page-box__author__name').first().text()) || null),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(prop('article:published_time') ?? jsonLdText(ld?.datePublished)),
    } satisfies ScrapedArticle
  },
}
