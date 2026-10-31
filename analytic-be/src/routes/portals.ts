import { Hono } from 'hono'
import { articles, categories, portals } from '../db'
import { listArticles } from './articles'

export const portalRoutes = new Hono()

function withCategories(portalKey: string) {
  const all = [...categories.values()]
    .filter((c) => c.portalKey === portalKey)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Article counts per "category/subcategory" for this portal
  const counts = new Map<string, number>()
  for (const a of articles) {
    if (a.portal.key !== portalKey) continue
    const key = `${a.category.slug}/${a.subcategory?.slug ?? ''}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const countOf = (category: string, subcategory?: string) =>
    [...counts]
      .filter(([key]) => {
        const [cat, sub] = key.split('/')
        return cat === category && (subcategory === undefined || sub === subcategory)
      })
      .reduce((sum, [, n]) => sum + n, 0)

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

portalRoutes.get('/', (c) => {
  const list = [...portals.values()].sort((a, b) => a.name.localeCompare(b.name))
  return c.json(list.map((portal) => ({ ...portal, categories: withCategories(portal.key) })))
})

portalRoutes.get('/:key', (c) => {
  const portal = portals.get(c.req.param('key'))
  if (!portal) return c.json({ error: 'Portal not found' }, 404)
  return c.json({ ...portal, categories: withCategories(portal.key) })
})

portalRoutes.get('/:key/articles', (c) => {
  const key = c.req.param('key')
  if (!portals.has(key)) return c.json({ error: 'Portal not found' }, 404)
  return listArticles(c, key)
})
