import { Hono, type Context } from 'hono'
import { articles, getArticle } from '../db'

export const articleRoutes = new Hono()

const time = (d: Date | null) => d?.getTime() ?? 0

/** Paginated article list (without content). Query: portal, category, subcategory, q, page, limit. */
export function listArticles(c: Context, portalKey?: string) {
  const { portal, category, subcategory, q } = c.req.query()
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 20))

  const portalFilter = portalKey ?? portal
  const portalKeys = portalFilter ? new Set(portalFilter.split(',')) : null
  const title = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'i') : null

  const matches = articles
    .filter(
      (a) =>
        (!portalKeys || portalKeys.has(a.portal.key)) &&
        (!category || a.category.slug === category) &&
        (!subcategory || a.subcategory?.slug === subcategory) &&
        (!title || title.test(a.title)),
    )
    .sort((a, b) => time(b.publishedAt) - time(a.publishedAt))

  const items = matches.slice((page - 1) * limit, page * limit).map(({ content: _content, ...rest }) => rest)
  return c.json({ items, page, limit, total: matches.length })
}

articleRoutes.get('/', (c) => listArticles(c))

articleRoutes.get('/:id', (c) => {
  const article = getArticle(c.req.param('id'))
  if (!article) return c.json({ error: 'Article not found' }, 404)
  return c.json(article)
})
