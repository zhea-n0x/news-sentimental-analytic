import * as cheerio from 'cheerio'
import { fetchHtml } from '../lib/http'
import { canonicalUrl, cleanText } from '../lib/utils'
import type { ListedArticle, PortalScraper, ScrapedArticle } from './types'

const INDEX_URL = 'https://indeks.kompas.com/headline'
const MAX_INDEX_PAGES = 10

export const kompasScraper: PortalScraper = {
  portal: {
    key: 'kompas',
    name: 'Kompas.com',
    url: 'https://www.kompas.com',
    indexUrl: INDEX_URL,
  },

  async listArticles(date) {
    const found = new Map<string, ListedArticle>()

    for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
      const html = await fetchHtml(`${INDEX_URL}?site=all&date=${date}&page=${page}`)
      const $ = cheerio.load(html)
      const before = found.size

      $('.articleItem a.article-link').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        const url = canonicalUrl(href, INDEX_URL)
        if (found.has(url)) return
        found.set(url, {
          url,
          title: cleanText($(el).find('.articleTitle').text()),
          label: cleanText($(el).find('.articlePost-subtitle').text()) || null,
        })
      })

      if (found.size === before || !$('.paging__link--next').length) break
    }

    return [...found.values()]
  },

  async scrapeArticle(url) {
    // page=all returns multi-page articles in a single response
    const html = await fetchHtml(`${url}?page=all`)
    const $ = cheerio.load(html)

    const meta = (name: string) => cleanText($(`meta[name="${name}"]`).attr('content')) || null
    const prop = (name: string) => cleanText($(`meta[property="${name}"]`).attr('content')) || null

    const content = extractContent($)
    if (!content) throw new Error('Article content not found')

    // Breadcrumb is "Kompas.com > Category > Subcategory"; used when the content_* meta tags are missing
    const breadcrumb = $('.breadcrumb__item')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .slice(1)

    const tags = (meta('content_tags') ?? meta('keywords') ?? '')
      .split(',')
      .map((tag) => cleanText(tag))
      .filter(Boolean)

    const published = prop('article:published_time')

    return {
      externalId: /\/read\/\d{4}\/\d{2}\/\d{2}\/(\d+)\//.exec(url)?.[1] ?? null,
      title: meta('content_title') ?? prop('og:title') ?? cleanText($('h1.read__title').text()),
      description: meta('description') ?? prop('og:description'),
      content,
      category: meta('content_category') ?? breadcrumb[0] ?? null,
      subcategory: meta('content_subcategory') ?? breadcrumb[1] ?? null,
      tags: [...new Set(tags)],
      author: meta('content_author'),
      editor: meta('content_editor'),
      imageUrl: prop('og:image'),
      publishedAt: published ? new Date(published) : null,
    } satisfies ScrapedArticle
  },
}

function extractContent($: cheerio.CheerioAPI) {
  const body = $('.read__content').first()
  body.find('script, style, noscript, iframe, figure, .ads-on-body, .kompasidRec').remove()

  // Anything after the #EndOfArticle marker is promo copy, not the article
  let node = body.find('#EndOfArticle').first()
  while (node.length && !node.is(body)) {
    node.nextAll().remove()
    node = node.parent()
  }

  const blocks: string[] = []
  body.find('p, h2, h3, li').each((_, el) => {
    const $el = $(el)
    // Only take innermost blocks so nested markup is not counted twice
    if ($el.find('p, h2, h3, li').length) return
    if ($el.find('.inner-link-baca-juga').length) return
    const text = cleanText($el.text())
    if (!text || /^baca juga\s*:/i.test(text)) return
    blocks.push(text)
  })

  return blocks.join('\n\n')
}
