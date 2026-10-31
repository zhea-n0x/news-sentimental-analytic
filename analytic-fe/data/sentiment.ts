import type { PortalKey } from './categories';
import { UNIFIED_LEAVES, rootOf } from './taxonomy';

/**
 * PLACEHOLDER DATA. There is no analysis backend yet, so this generates a
 * deterministic (seeded) 90-day history of daily article counts per category
 * and source. Swap `ROWS` for the real thing; everything else reads from it.
 */
export const USING_SAMPLE_DATA = true;

export type Sentiment = 'positive' | 'neutral' | 'negative';
export const SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative'];

export interface Counts {
  positive: number;
  neutral: number;
  negative: number;
}

export interface Row extends Counts {
  /** yyyy-mm-dd (UTC) */
  date: string;
  /** Unified leaf category id, see ./taxonomy */
  leafId: string;
  portalKey: PortalKey;
}

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

const DAY = 86_400_000;
const DAYS = 90;
/** Last day of data. Periods count back from here, not from the wall clock. */
export const DATA_END = Date.UTC(2026, 9, 30);

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// --- seeded randomness -------------------------------------------------

export const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Each category/source pair leans a little positive or negative. */
export const leanOf = (leafId: string, portalKey: PortalKey) => {
  const leaf = (mulberry32(hash(`${leafId}|${portalKey}|lean`))() - 0.5) * 0.5;
  const section = (mulberry32(hash(`${leafId.split('/')[0]}|section`))() - 0.5) * 0.8;
  return leaf + section;
};

// --- rows --------------------------------------------------------------

export const ROWS: Row[] = [];

for (const leaf of UNIFIED_LEAVES) {
  for (const portalKey of leaf.sources) {
    const rnd = mulberry32(hash(`${leaf.id}|${portalKey}`));
    const lean = leanOf(leaf.id, portalKey);
    const phase = rnd() * Math.PI * 2;
    const volume = 3 + rnd() * 9;

    for (let d = 0; d < DAYS; d++) {
      const s = clamp(
        lean +
          0.18 * Math.sin(d / 10 + phase) +
          // News-cycle swing shared by every category.
          0.12 * Math.sin(d / 7) +
          (rnd() - 0.5) * 0.3,
        -0.9,
        0.9,
      );
      const total = Math.max(1, Math.round(volume * (0.6 + rnd() * 0.8)));
      const positive = Math.round(total * (0.3 + 0.3 * s));
      const negative = Math.round(total * (0.3 - 0.3 * s));
      ROWS.push({
        date: isoDay(DATA_END - (DAYS - 1 - d) * DAY),
        leafId: leaf.id,
        portalKey,
        positive,
        negative,
        neutral: Math.max(0, total - positive - negative),
      });
    }
  }
}

// --- aggregation -------------------------------------------------------

export const emptyCounts = (): Counts => ({
  positive: 0,
  neutral: 0,
  negative: 0,
});

export const total = (c: Counts) => c.positive + c.neutral + c.negative;

/** (positive - negative) / total, from -1 (all negative) to +1 (all positive). */
export const netScore = (c: Counts) =>
  total(c) ? (c.positive - c.negative) / total(c) : 0;

export const sumCounts = (rows: Row[]): Counts =>
  rows.reduce((acc, r) => {
    acc.positive += r.positive;
    acc.neutral += r.neutral;
    acc.negative += r.negative;
    return acc;
  }, emptyCounts());

export const periodStart = (days: Period) =>
  isoDay(DATA_END - (days - 1) * DAY);

/** Rows in the period, optionally limited to some leaf categories. */
export const selectRows = (days: Period, leafIds?: Set<string>) => {
  const start = periodStart(days);
  return ROWS.filter(
    (r) => r.date >= start && (!leafIds?.size || leafIds.has(r.leafId)),
  );
};

export const groupRows = <K extends string>(
  rows: Row[],
  key: (r: Row) => K,
): Map<K, Row[]> => {
  const out = new Map<K, Row[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
};

export const rootIdOfRow = (r: Row) => rootOf(r.leafId).id;
