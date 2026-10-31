import { Hono, type Context } from 'hono'
import { ObjectId, type Filter } from 'mongodb'
import { articles } from '../db'
import type { Article } from '../types'

export const articleRoutes = new Hono()

/** Paginated article list (without content). Query: portal, category, subcategory, q, page, limit. */
export async function listArticles(c: Context, portalKey?: string) {
  const { portal, category, subcategory, q } = c.req.query()
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 20))

  const filter: Filter<Article> = {}
  const portalFilter = portalKey ?? portal
  if (portalFilter) filter['portal.key'] = { $in: portalFilter.split(',') }
  if (category) filter['category.slug'] = category
  if (subcategory) filter['subcategory.slug'] = subcategory
  if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), $options: 'i' }

  const [items, total] = await Promise.all([
    articles
      .find(filter, { projection: { content: 0 } })
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    articles.countDocuments(filter),
  ])

  return c.json({ items, page, limit, total })
}

articleRoutes.get('/', (c) => listArticles(c))

articleRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid id' }, 400)
  const article = await articles.findOne({ _id: new ObjectId(id) })
  if (!article) return c.json({ error: 'Article not found' }, 404)
  return c.json(article)
})
