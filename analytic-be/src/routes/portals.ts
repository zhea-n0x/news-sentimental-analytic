import { Hono } from 'hono'
import { articles, categories, portals } from '../db'
import { listArticles } from './articles'

export const portalRoutes = new Hono()

async function withCategories(portalKey: string) {
  const [all, counts] = await Promise.all([
    categories.find({ portalKey }).sort({ name: 1 }).toArray(),
    articles
      .aggregate<{ _id: { category: string; subcategory: string | null }; count: number }>([
        { $match: { 'portal.key': portalKey } },
        { $group: { _id: { category: '$category.slug', subcategory: '$subcategory.slug' }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ])

  const countOf = (category: string, subcategory?: string) =>
    counts
      .filter((c) => c._id.category === category && (subcategory === undefined || c._id.subcategory === subcategory))
      .reduce((sum, c) => sum + c.count, 0)

  return all
    .filter((c) => c.parentSlug === null)
    .map((c) => ({
      name: c.name,
      slug: c.slug,
      articleCount: countOf(c.slug),
      subcategories: all
        .filter((s) => s.parentSlug === c.slug)
        .map((s) => ({ name: s.name, slug: s.slug, articleCount: countOf(c.slug, s.slug) })),
    }))
}

portalRoutes.get('/', async (c) => {
  const list = await portals.find().sort({ name: 1 }).toArray()
  return c.json(
    await Promise.all(list.map(async (portal) => ({ ...portal, categories: await withCategories(portal.key) }))),
  )
})

portalRoutes.get('/:key', async (c) => {
  const portal = await portals.findOne({ key: c.req.param('key') })
  if (!portal) return c.json({ error: 'Portal not found' }, 404)
  return c.json({ ...portal, categories: await withCategories(portal.key) })
})

portalRoutes.get('/:key/articles', async (c) => {
  const key = c.req.param('key')
  if (!(await portals.countDocuments({ key }, { limit: 1 }))) return c.json({ error: 'Portal not found' }, 404)
  return listArticles(c, key)
})
