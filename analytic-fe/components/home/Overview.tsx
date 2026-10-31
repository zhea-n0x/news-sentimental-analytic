'use client';

import { Stack } from '@mantine/core';
import type { AnalysisResponse } from '@/lib/api';
import { categoryColor, leavesOf, type TaxonomyIndex } from '@/lib/taxonomy';
import { NetTrendChart } from './NetTrendChart';
import { SentimentMixChart } from './SentimentMixChart';
import { StatTiles } from './StatTiles';

interface Props {
  data: AnalysisResponse;
  index: TaxonomyIndex;
  /** Narrow the dashboard to these leaf categories (drill-down). */
  onSelectLeaves: (leafIds: string[]) => void;
}

/** Every category at a glance (or just the selected ones). */
export function Overview({ data, index, onSelectLeaves }: Props) {
  const mix = data.breakdown.rows.map((g) => ({
    id: g.id,
    name: g.name,
    color: categoryColor(index, g.id),
    counts: g.counts,
  }));

  return (
    <Stack gap="md">
      <StatTiles totals={data.totals} />
      <SentimentMixChart
        title="Sentiment by category"
        description="Share of positive, neutral and negative articles. Select a bar to see that category in detail."
        rows={mix}
        onSelect={(id) => {
          const node = index.byId.get(id);
          if (node) onSelectLeaves(leavesOf(node));
        }}
      />
      <NetTrendChart
        title="Net sentiment over time"
        trend={data.trend}
        series={[{ key: 'overall', label: 'All selected', color: 'var(--viz-ink)' }]}
      />
    </Stack>
  );
}
