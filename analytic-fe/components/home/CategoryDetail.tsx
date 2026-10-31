'use client';

import { Box, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { AnalysisResponse, ArticleCard } from '@/lib/api';
import { categoryColor, leavesOf, sourceColor, type TaxonomyIndex } from '@/lib/taxonomy';
import { NetTrendChart, type TrendSeries } from './NetTrendChart';
import { NewsCard } from './NewsCard';
import { SentimentMixChart } from './SentimentMixChart';
import { StatTiles } from './StatTiles';

interface Props {
  data: AnalysisResponse;
  index: TaxonomyIndex;
  onSelectLeaves: (leafIds: string[]) => void;
  onOpenArticle: (article: ArticleCard) => void;
}

const ARTICLES_SHOWN = 9;

/** One category in depth: breakdown, per-source trend and article thumbnails from several sources. */
export function CategoryDetail({ data, index, onSelectLeaves, onOpenArticle }: Props) {
  // Sources keep one color across the breakdown and the trend (ordered by volume)
  const colorOfSource = new Map(data.sources.map((s, i) => [s.id, sourceColor(i)]));

  const bySubcategory = data.breakdown.by === 'category';
  const breakdownRows = data.breakdown.rows.map((g) => ({
    id: g.id,
    name: g.name,
    counts: g.counts,
    color: bySubcategory ? categoryColor(index, g.id) : (colorOfSource.get(g.id) ?? 'var(--viz-muted)'),
  }));

  const trend: TrendSeries[] = [
    { key: 'overall', label: 'Overall', color: 'var(--viz-ink)' },
    ...data.trend.series.map((s) => ({
      key: s.key,
      label: s.name,
      color: colorOfSource.get(s.key) ?? 'var(--viz-muted)',
    })),
  ];

  const articles = data.articles.slice(0, ARTICLES_SHOWN);
  const articleSources = [...new Map(articles.map((a) => [a.portal.key, a.portal.name]))];

  return (
    <Stack gap="md">
      <StatTiles totals={data.totals} />

      {breakdownRows.length > 1 && (
        <SentimentMixChart
          title={bySubcategory ? 'Sentiment by sub-category' : 'Sentiment by source'}
          description={
            bySubcategory
              ? 'Select a bar to focus on that sub-category.'
              : 'How each news portal covers this category.'
          }
          rows={breakdownRows}
          noun={bySubcategory ? 'category' : 'source'}
          onSelect={
            bySubcategory
              ? (id) => {
                  const node = index.byId.get(id);
                  if (node) onSelectLeaves(leavesOf(node));
                }
              : undefined
          }
        />
      )}

      <NetTrendChart
        title={trend.length > 1 ? 'Net sentiment by source' : 'Net sentiment over time'}
        trend={data.trend}
        series={trend}
      />

      <Stack gap="sm" mt="xs">
        <Group justify="space-between" align="baseline" wrap="wrap">
          <Text fw={600}>Latest articles</Text>
          <Group gap="md">
            <Text size="xs" c="dimmed">
              {articleSources.length} {articleSources.length === 1 ? 'source' : 'sources'}
            </Text>
            {articleSources.map(([key, name]) => (
              <Group key={key} gap={6} wrap="nowrap">
                <Box
                  w={8}
                  h={8}
                  style={{ background: colorOfSource.get(key) ?? 'var(--viz-muted)', borderRadius: 2 }}
                />
                <Text size="xs" c="dimmed">
                  {name}
                </Text>
              </Group>
            ))}
          </Group>
        </Group>

        {articles.length ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {articles.map((a) => (
              <NewsCard key={a.id} article={a} onOpen={onOpenArticle} />
            ))}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">
            No articles in this period.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
