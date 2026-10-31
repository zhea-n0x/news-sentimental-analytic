import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { jsonLdText, metaReader, parseDate, parseFeed, readJsonLd, readJsonLdBreadcrumb, splitTags } from '../lib/html'
import { canonicalUrl, cleanText, forEachChannel } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const BASE_URL = 'https://kumparan.com'
// No server-rendered index; each channel's news sitemap lists its latest ~100 stories (~18 hours for news)
const CHANNELS = [
  'news', 'bisnis', 'entertainment', 'tekno-sains', 'otomotif', 'bola-sports',
  'food-travel', 'woman', 'mom', 'buzz', 'bolanita',
]
// Newsroom stories are published under "kumparan*" accounts (kumparannews, kumparanbisnis...);
// other accounts are media partners and user posts
const ARTICLE_URL = /^https:\/\/kumparan\.com\/kumparan[a-z]*\/[a-z0-9-]+-([0-9A-Za-z]{11})$/

export const kumparanScraper: PortalScraper = {
  portal: {
    key: 'kumparan',
    name: 'kumparan',
    url: BASE_URL,
    indexUrl: `${BASE_URL}/sitemap_channel_news.xml`,
  },
  todayOnly: true,

  async listArticles() {
    const found = new Map<string, ListedArticle>()

    await forEachChannel(CHANNELS, async (channel) => {
      const xml = await fetchPage(`${BASE_URL}/sitemap_channel_${channel}.xml`)
      if (!xml) return
      for (const item of parseFeed(xml)) {
        const url = canonicalUrl(item.url)
        if (!ARTICLE_URL.test(url) || found.has(url)) continue
        found.set(url, { url, title: item.title, label: null, publishedAt: item.publishedAt })
      }
    })

    return [...found.values()]
  },

  async scrapeArticle(url) {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    // Class names are generated, so the stable hooks are data-qa-id attributes
    const content = $('[data-qa-id="story-paragraph"]')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .join('\n\n')
    if (!content) throw new Error('Article content not found')

    // JSON-LD breadcrumb: "News" > "kumparanNEWS" (publisher account) > headline
    const breadcrumb = readJsonLdBreadcrumb($)

    return {
      externalId: ARTICLE_URL.exec(url)?.[1] ?? null,
      title: jsonLdText(ld?.headline) ?? cleanText($('h1[data-qa-id="story-title"]').text()),
      description: meta('description') ?? prop('og:description'),
      content,
      category: breadcrumb[0] ?? null,
      subcategory: null,
      tags: splitTags($('[data-qa-id="label-tag-topic"]').map((_, el) => $(el).text()).get()),
      author: jsonLdText(ld?.author),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(jsonLdText(ld?.datePublished)),
    } satisfies ScrapedArticle
  },
}
