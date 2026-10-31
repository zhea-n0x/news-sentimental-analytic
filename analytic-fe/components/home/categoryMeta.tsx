import type { Sentiment } from '@/lib/api';

/** Display metadata for the three sentiment classes (colors are chart tokens). */
export const SENTIMENT_META: Record<
  Sentiment,
  { label: string; color: string }
> = {
  positive: { label: 'Positive', color: 'var(--viz-pos)' },
  neutral: { label: 'Neutral', color: 'var(--viz-neu)' },
  negative: { label: 'Negative', color: 'var(--viz-neg)' },
};
