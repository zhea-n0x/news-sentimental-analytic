import * as cheerio from 'cheerio'
import { fetchHtml } from '../lib/http'
import { extractBlocks, metaReader, parseDate, splitTags, titleCase } from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from './types'

const BASE_URL = 'https://www.cnnindonesia.com'
// "/indeks/2" is the full news index; plain "/indeks" only shows the first 10 items
const INDEX_URL = `${BASE_URL}/indeks/2`
// 10 items per page; a busy day is ~270 items, so this leaves headroom
const MAX_INDEX_PAGES = 60
// Article URLs look like /nasional/20261031114307-20-1421730/slug
const ARTICLE_PATH = /^\/[a-z-]+\/\d{14}-\d+-(\d+)\//
const VIDEO_TYPES = new Set(['video', 'verticalvideo'])

export const cnnIndonesiaScraper: PortalScraper = {
  portal: {
    key: 'cnn-indonesia',
    name: 'CNN Indonesia',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
      const html = await fetchHtml(`${INDEX_URL}?date=${date.replaceAll('-', '/')}&page=${page}`)
      const $ = cheerio.load(html)
      const before = found.size

      $('article a[href]').each((_, el) => {
        const $el = $(el)
        const href = $el.attr('href')
        if (!href) return
        const url = canonicalUrl(href, BASE_URL)
        const { pathname } = new URL(url)
        if (!ARTICLE_PATH.test(pathname) || found.has(url)) return
        // Video items have no article text to analyse
        if (pathname.startsWith('/tv/') || $el.find('img[alt="icon-video"]').length) return
        found.set(url, {
          url,
          title: cleanText($el.find('h2').text()),
          label: cleanText($el.find('span.text-cnn_red').last().text()) || null,
        })
      })

      // Past the last page the index renders an empty list
      if (!$('article a[href]').length) break
      if (found.size === before && page > 1) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // Multi-page articles render every page in the first response (later pages are hidden cards)
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)

    const { name: meta, prop } = metaReader($)

    const contentType = meta('contenttype')
    if (contentType && VIDEO_TYPES.has(contentType)) throw new SkipArticle(contentType)

    const title = meta('originalTitle') ?? prop('og:title') ?? cleanText($('#article-judul').text())
    const content = extractBlocks($, '.detail-text', {
      remove: [
        'center, table, .paradetail, .daftar-isi, #article-toc-section, .page-divider, #info-page',
        // Image captions sit next to the image inside the same wrapper
        'div:has(> img)',
      ],
      skip: [/^\[Gambas:.*\]$/i],
      title,
      dateline: /CNN Indonesia\s*--$/,
    })
    if (!content) throw new Error('Article content not found')

    // Breadcrumb has display names ("Hukum & Kriminal"); meta tags only carry slugs ("hukum-kriminal")
    const category = cleanText($('.gtm_breadcrumb_kanal').first().text()) || titleCase(meta('dtk:namakanal'))
    const subcategory = cleanText($('.gtm_breadcrumb_subkanal').first().text()) || titleCase(meta('subkanal'))

    const tags = meta('tag') ? splitTags(meta('tag'), '|') : splitTags(meta('keywords'))

    return {
      externalId: meta('articleid') ?? ARTICLE_PATH.exec(new URL(url).pathname)?.[1] ?? null,
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category,
      subcategory,
      tags,
      author: meta('author'),
      editor: null,
      imageUrl: prop('og:image'),
      publishedAt: parseDate(Number(meta('dtk:publishdateunix')) || meta('publishdate')),
    } satisfies ScrapedArticle
  },
}
