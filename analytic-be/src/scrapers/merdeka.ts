import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, jsonLdText, metaReader, parseDate, parseFeed, readJsonLd, splitTags, titleCase } from '../lib/html'
import { canonicalUrl, cleanText, forEachChannel } from '../lib/utils'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from './types'

const BASE_URL = 'https://www.merdeka.com'
// There is no daily index; each channel's news sitemap lists its latest 100 articles (1-2 days)
const CHANNELS = [
  'peristiwa', 'politik', 'uang', 'dunia', 'teknologi', 'oto', 'sehat', 'gaya',
  'artis', 'trending', 'sport', 'bolasport', 'cek-fakta',
]
// Article URLs look like https://www.merdeka.com/peristiwa/read/8325574/slug
const ARTICLE_URL = /^https:\/\/www\.merdeka\.com\/[a-z0-9-]+\/read\/(\d+)\//

export const merdekaScraper: PortalScraper = {
  portal: {
    key: 'merdeka',
    name: 'Merdeka.com',
    url: BASE_URL,
    indexUrl: `${BASE_URL}/sitemap.xml`,
  },
  todayOnly: true,

  async listArticles() {
    const found = new Map<string, ListedArticle>()

    await forEachChannel(CHANNELS, async (channel) => {
      const xml = await fetchPage(`${BASE_URL}/${channel}/sitemap.xml`)
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
    // Multi-page articles render every page in the first response
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)
    const ld = readJsonLd($)

    // Inline analytics object: {"gtm":{"type":"TextTypeArticle","tag":"a|b|c",...}}
    const type = /"type":"(\w+TypeArticle|PhotoGallery|Video\w*)"/.exec(html)?.[1]
    if (type && type !== 'TextTypeArticle') throw new SkipArticle(type)

    const title = jsonLdText(ld?.headline) ?? prop('og:title') ?? cleanText($('h1').first().text())
    const content = extractBlocks($, '.articles-content__body[data-component="virtual-page-view"]', {
      remove: ['.bg-primary-50, .channel-ad, figure, .page-break, .nextpage-articles, .editorial-articles'],
      title,
    })
    if (!content) throw new Error('Article content not found')

    // Channel slugs from the inline analytics object; the HTML breadcrumb is missing on some templates
    const channel = /"subCategory":"([^"]*)"/.exec(html)?.[1]
    const subchannel = /"subSubCategory":"([^"]*)"/.exec(html)?.[1]
    const tags = /"tag":"([^"]*)"/.exec(html)?.[1]

    return {
      externalId: ARTICLE_URL.exec(url)?.[1] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: titleCase(channel),
      subcategory: titleCase(subchannel),
      tags: tags ? splitTags(tags, '|') : splitTags(meta('keywords')),
      author: /"reporters":"([^"]+)"/.exec(html)?.[1] ?? meta('author'),
      editor: /"editors":"([^"]+)"/.exec(html)?.[1] ?? null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(prop('article:published_time') ?? jsonLdText(ld?.datePublished)),
    } satisfies ScrapedArticle
  },
}
