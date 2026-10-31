import type { PortalKey } from './categories';
import {
  DATA_END,
  hash,
  isoDay,
  leanOf,
  mulberry32,
  type Period,
  type Sentiment,
  periodStart,
} from './sentiment';
import { UNIFIED_BY_ID, UNIFIED_LEAVES, categoryLabel } from './taxonomy';

/**
 * PLACEHOLDER ARTICLES, generic and clearly labelled as samples. Replace
 * `ARTICLES` with analysed articles from your API: each needs a source, a
 * unified leaf category id and a sentiment.
 */
export interface Article {
  id: string;
  title: string;
  excerpt: string;
  body: string[];
  portalKey: PortalKey;
  /** Unified leaf category id, see ./taxonomy */
  categoryId: string;
  /** yyyy-mm-dd (UTC) */
  date: string;
  sentiment: Sentiment;
  /** -1 (negative) to +1 (positive) */
  score: number;
  /** Optional real thumbnail. When omitted a neutral placeholder is shown. */
  image?: string;
}

const DAY = 86_400_000;
const PER_SERIES = 8;

export const ARTICLES: Article[] = [];

for (const leaf of UNIFIED_LEAVES) {
  for (const portalKey of leaf.sources) {
    const rnd = mulberry32(hash(`${leaf.id}|${portalKey}|articles`));
    const lean = leanOf(leaf.id, portalKey);
    const path = categoryLabel(leaf.id);

    for (let i = 0; i < PER_SERIES; i++) {
      const score = Math.max(-0.95, Math.min(0.95, lean + (rnd() - 0.5) * 1.4));
      ARTICLES.push({
        id: `${portalKey}|${leaf.id}|${i}`,
        title: `Sample headline: ${leaf.name}`,
        excerpt: `Placeholder summary for ${path}. Replace with analysed articles from your API.`,
        body: [
          `This is placeholder content for the ${path} category.`,
          'Connect the sentiment API to show real articles here.',
        ],
        portalKey,
        categoryId: leaf.id,
        date: isoDay(DATA_END - Math.floor(rnd() * 28) * DAY),
        sentiment: score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral',
        score: Math.round(score * 100) / 100,
      });
    }
  }
}

export const articlesFor = (leafIds: string[], days: Period) => {
  const ids = new Set(leafIds);
  const start = periodStart(days);
  return ARTICLES.filter((a) => ids.has(a.categoryId) && a.date >= start);
};

/**
 * Newest articles, taken round-robin across sources so as many different
 * sources as possible show up (aim: at least three).
 */
export const pickDiverse = (articles: Article[], limit = 6): Article[] => {
  const queues = new Map<PortalKey, Article[]>();
  for (const a of [...articles].sort((x, y) => y.date.localeCompare(x.date))) {
    const q = queues.get(a.portalKey);
    if (q) q.push(a);
    else queues.set(a.portalKey, [a]);
  }
  const lists = [...queues.values()];
  const out: Article[] = [];
  while (out.length < limit && lists.some((l) => l.length)) {
    for (const l of lists) {
      const next = l.shift();
      if (next && out.length < limit) out.push(next);
    }
  }
  return out;
};

export const categoryName = (id: string) => UNIFIED_BY_ID[id].name;
