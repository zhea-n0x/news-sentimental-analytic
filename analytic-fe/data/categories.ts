import raw from './categories.json';

export type PortalKey = 'kompas' | 'cnn-indonesia';

export interface Portal {
  key: PortalKey;
  label: string;
  /** CSS color for this source in charts (categorical slots; blue/red are reserved for sentiment). */
  color: string;
}

export const PORTALS: Portal[] = [
  { key: 'kompas', label: 'Kompas', color: 'var(--viz-src-1)' },
  { key: 'cnn-indonesia', label: 'CNN Indonesia', color: 'var(--viz-src-2)' },
];

interface RawCategory {
  portalKey: string;
  slug: string;
  parentSlug: string | null;
  name: string;
}

export interface Category {
  /** Unique across portals: `portal:slug` or `portal:parent/slug`. */
  key: string;
  portalKey: PortalKey;
  slug: string;
  name: string;
  parentKey: string | null;
  children: Category[];
}

/**
 * Slugs are not unique on their own (e.g. CNN has three "lainnya" children),
 * so the parent is part of the key.
 */
export const categoryKey = (
  portalKey: string,
  slug: string,
  parentSlug: string | null = null,
) => `${portalKey}:${parentSlug ? `${parentSlug}/` : ''}${slug}`;

// "Lainnya" (Other) always goes last, the rest alphabetically.
const byName = (a: Category, b: Category) =>
  Number(a.slug === 'lainnya') - Number(b.slug === 'lainnya') ||
  a.name.localeCompare(b.name);

const all = raw as RawCategory[];

export const CATEGORY_BY_KEY: Record<string, Category> = {};

for (const c of all) {
  CATEGORY_BY_KEY[categoryKey(c.portalKey, c.slug, c.parentSlug)] = {
    key: categoryKey(c.portalKey, c.slug, c.parentSlug),
    portalKey: c.portalKey as PortalKey,
    slug: c.slug,
    name: c.name,
    parentKey: c.parentSlug ? categoryKey(c.portalKey, c.parentSlug) : null,
    children: [],
  };
}

/** Top-level categories (with their children) per portal. */
export const CATEGORY_TREE = Object.fromEntries(
  PORTALS.map((p) => [p.key, [] as Category[]]),
) as Record<PortalKey, Category[]>;

for (const cat of Object.values(CATEGORY_BY_KEY)) {
  const parent = cat.parentKey ? CATEGORY_BY_KEY[cat.parentKey] : undefined;
  (parent ? parent.children : CATEGORY_TREE[cat.portalKey]).push(cat);
}
for (const roots of Object.values(CATEGORY_TREE)) {
  roots.sort(byName);
  roots.forEach((r) => r.children.sort(byName));
}

/** Categories articles can belong to: children, or top-level ones without children. */
export const LEAF_CATEGORIES: Category[] = Object.values(CATEGORY_TREE).flatMap(
  (roots) => roots.flatMap((r) => (r.children.length ? r.children : [r])),
);

export const getPortal = (key: PortalKey) =>
  PORTALS.find((p) => p.key === key)!;
