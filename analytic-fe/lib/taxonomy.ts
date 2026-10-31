import type { CategoryNode } from './api';

// Helpers over the unified category tree served by analytic-be (GET /analysis/categories).
// Filters select leaf ids: a child category, or a root that has no children.

export interface TaxonomyIndex {
  roots: CategoryNode[];
  byId: Map<string, CategoryNode>;
  parentOf: Map<string, string>;
}

export function indexTaxonomy(roots: CategoryNode[]): TaxonomyIndex {
  const byId = new Map<string, CategoryNode>();
  const parentOf = new Map<string, string>();
  for (const root of roots) {
    byId.set(root.id, root);
    for (const child of root.children ?? []) {
      byId.set(child.id, child);
      parentOf.set(child.id, root.id);
    }
  }
  return { roots, byId, parentOf };
}

export const leavesOf = (node: CategoryNode): string[] =>
  node.children?.length ? node.children.map((c) => c.id) : [node.id];

/** "Olahraga › Sepak Bola" for a child, the plain name for a root. */
export function categoryLabel(index: TaxonomyIndex, id: string) {
  const node = index.byId.get(id);
  if (!node) return id;
  const parent = index.parentOf.get(id);
  return parent ? `${index.byId.get(parent)?.name ?? parent} › ${node.name}` : node.name;
}

const PALETTE = 13;
const slot = (n: number) => `var(--viz-cat-${(n % PALETTE) + 1})`;

/**
 * Stable color per category (follows the category, not its row in a chart).
 * Roots take slots in taxonomy order; the children of a root take the following
 * slots, so they never reuse their parent's color.
 */
export function categoryColor(index: TaxonomyIndex, id: string) {
  const parent = index.parentOf.get(id);
  const rootId = parent ?? id;
  const rootIdx = index.roots.findIndex((r) => r.id === rootId);
  if (rootIdx < 0) return 'var(--viz-muted)';
  if (!parent) return slot(rootIdx);
  const childIdx = index.byId.get(parent)?.children?.findIndex((c) => c.id === id) ?? 0;
  return slot(rootIdx + 1 + childIdx);
}

/** Color for the n-th source in a list (sources have no fixed order across selections). */
export const sourceColor = (n: number) => slot(n);
