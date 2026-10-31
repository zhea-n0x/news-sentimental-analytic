import * as cheerio from 'cheerio'
import { fetchHtml, fetchPage } from '../lib/http'
import { extractBlocks, metaReader, parseDate, parseIndonesianDate, splitTags } from '../lib/html'
import { canonicalUrl, cleanText } from '../lib/utils'
import { SkipArticle, type ListedArticle, type PortalScraper, type ScrapedArticle } from './types'

const BASE_URL = 'https://www.idntimes.com'
const INDEX_URL = `${BASE_URL}/index`
const PAGE_SIZE = 20
const MAX_INDEX_PAGES = 40
// Article URLs look like https://www.idntimes.com/news/indonesia/slug (regional sites use the same layout)
const ARTICLE_URL = /^https:\/\/[a-z]+\.idntimes\.com\/[a-z-]+\/[a-z-]+\/[a-z0-9-]+$/

export const idnTimesScraper: PortalScraper = {
  portal: {
    key: 'idn-times',
    name: 'IDN Times',
    url: BASE_URL,
    indexUrl: INDEX_URL,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
      const html = await fetchPage(`${INDEX_URL}?date=${date}&page=${page}`)
      if (!html) break
      const $ = cheerio.load(html)
      // Sidebar widgets reuse the card markup inside <section>; the day's list is not inside one
      const cards = $('h2[data-cy="ds-card-article-title"]').filter((_, el) => !$(el).parents('section').length)

      cards.each((_, el) => {
        const link = $(el).closest('a[href]')
        const href = link.attr('href')
        if (!href) return
        const url = canonicalUrl(href, BASE_URL)
        // Quizzes are interactive pages, not news; "c1c2-" slugs are user-submitted community posts
        if (!ARTICLE_URL.test(url) || /\/quiz-|c1c2-/.test(url) || found.has(url)) return
        const card = link.parent()
        found.set(url, {
          url,
          title: cleanText($(el).text()),
          label: cleanText(card.find('[data-cy="ds-card-article-category"]').first().text()) || null,
          publishedAt: parseIndonesianDate(card.find('[data-cy="ds-card-article-pubdate"]').first().text()),
        })
      })

      if (cards.length < PAGE_SIZE) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    const { name: meta, prop } = metaReader($)

    // "community" posts are user-submitted; only keep the newsroom's editorial content
    const variant = meta('content_type_var')
    if (variant && variant !== 'editorial') throw new SkipArticle(`${variant} post`)

    const title = prop('og:title') ?? cleanText($('h1').first().text())
    // Intro paragraphs (#article-description) and listicle sections (#article-listicle) share this container
    // with the byline header and the "Intinya Sih" summary widget, which are dropped
    const content = extractBlocks($, '#article-section', {
      remove: [
        '#article-section > :not(#article-description):not(#article-listicle)',
        '.wrapper-ads, [id^="IDN_InArticle"], [id^="div-gpt-ad"], figure, [data-testid="tag-list"]',
      ],
      title,
    })
    if (!content) throw new Error('Article content not found')

    return {
      externalId: meta('content_id'),
      title,
      description: meta('description') ?? prop('og:description'),
      content,
      category: meta('content_category'),
      subcategory: meta('content_subcategory'),
      tags: splitTags(meta('content_tag') ?? meta('keywords')),
      author: meta('content_creator_fullname') ?? meta('author'),
      editor: meta('content_editor'),
      imageUrl: prop('og:image'),
      publishedAt: parseDate(meta('content_published_date')),
    } satisfies ScrapedArticle
  },
}
