import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import {
  extractBlocks,
  jsonLdText,
  metaReader,
  parseDate,
  parseFeed,
  readJsonLd,
  readJsonLdBreadcrumb,
  splitTags,
  titleCase,
} from '../lib/html'
import { canonicalUrl, cleanText, forEachChannel } from '../lib/utils'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from './types'

const BASE_URL = 'https://www.detik.com'
// Each channel is its own subdomain with its own feed
const CHANNELS = ['news', 'finance', 'hot', 'inet', 'sport', 'oto', 'travel', 'food', 'health', 'wolipop']
// Article URLs look like https://news.detik.com/berita/d-8732358/slug
const ARTICLE_URL = /^https:\/\/([a-z]+)\.detik\.com\/(?:[a-z0-9-]+\/)*d-(\d+)\/[^/]+$/

export const detikScraper: PortalScraper = {
  portal: {
    key: 'detik',
    name: 'detikcom',
    url: BASE_URL,
    indexUrl: 'https://news.detik.com/rss',
  },

  // Each channel's official RSS holds its latest 100 articles (18+ hours), plenty for an hourly run.
  // The paginated /indeks pages are unreliable: their CDN often serves another page's cached copy.
  todayOnly: true,

  async listArticles() {
    const found = new Map<string, ListedArticle>()

    await forEachChannel(CHANNELS, async (channel) => {
      const xml = await fetchPage(`https://${channel}.detik.com/rss`)
      if (!xml) return
      for (const item of parseFeed(xml)) {
        const url = canonicalUrl(item.url)
        // Video lives on 20.detik.com, photo stories under /foto-news/, /fotoinet/, /galeri-foto/... paths
        if (!ARTICLE_URL.test(url) || /\/(foto[a-z-]*|galeri-foto)\//.test(url) || found.has(url)) continue
        found.set(url, { url, title: item.title, label: null, publishedAt: item.publishedAt })
      }
    })

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // single=1 renders multi-page articles in one response
    const html = await fetchHtml(`${url}?single=1`)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    const contentType = meta('dtk:contenttype')
    if (contentType && /video|foto/.test(contentType)) throw new SkipArticle(contentType)

    const title = jsonLdText(ld?.headline) ?? prop('og:title') ?? cleanText($('h1.detail__title').text())
    // Most channels use .detail__body-text; wolipop only has .itp_bodycontent
    const content = extractBlocks($, '.detail__body-text, .itp_bodycontent', {
      remove: [
        '.parallaxindetail, .staticdetail_container, .staticdetail_ads, .parallax_ads, .box-ads, [class^="ads-scrollpage"]',
        '.noncontent, table, .lihatjg, .para_caption, .detail__body-tag, .detail__multiple, .nav, .detail__long-nav',
      ],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // Breadcrumb: "detikNews" > "Berita"; some templates only have it as JSON-LD
    let breadcrumb = $('.page__breadcrumb a')
      .map((_, el) => cleanText($(el).attr('dtr-ttl') ?? $(el).text()))
      .get()
      .filter((name) => name && !/^home$/i.test(name))
    if (!breadcrumb.length) breadcrumb = readJsonLdBreadcrumb($)
    const channel = ARTICLE_URL.exec(url)?.[1]

    return {
      externalId: meta('dtk:articleid') ?? ARTICLE_URL.exec(url)?.[2] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: breadcrumb[0] ?? (channel ? `detik${titleCase(channel)}` : null),
      subcategory: breadcrumb[1] ?? titleCase(new URL(url).pathname.split('/')[1]),
      tags: splitTags(meta('dtk:keywords') ?? meta('keywords')),
      author: meta('dtk:author') ?? meta('author'),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(Number(meta('dtk:publishdateunix')) || meta('dtk:publishdate')),
    } satisfies ScrapedArticle
  },
}
