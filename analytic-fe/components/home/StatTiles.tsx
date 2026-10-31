'use client';

import { Box, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { netScore, type Group as Totals } from '@/lib/api';
import { SENTIMENT_META } from './categoryMeta';

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;

function Tile({
  label,
  value,
  note,
  swatch,
}: {
  label: string;
  value: string;
  note?: string;
  swatch?: string;
}) {
  return (
    <Paper withBorder p="md" radius="md" bg="var(--viz-surface)">
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap">
          {swatch && (
            <Box w={10} h={10} style={{ background: swatch, borderRadius: 2 }} />
          )}
          <Text size="xs" style={{ color: 'var(--viz-ink-2)' }}>
            {label}
          </Text>
        </Group>
        <Text fz={28} fw={600} lh={1.1} style={{ color: 'var(--viz-ink)' }}>
          {value}
        </Text>
        {note && (
          <Text size="xs" style={{ color: 'var(--viz-muted)' }}>
            {note}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

export function StatTiles({ totals }: { totals: Totals }) {
  const { counts, analyzed, articles } = totals;
  const share = (v: number) => (analyzed ? `${Math.round((v / analyzed) * 100)}%` : '–');

  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
      <Tile
        label="Articles analysed"
        value={analyzed.toLocaleString('en-US')}
        note={`of ${articles.toLocaleString('en-US')} in the period`}
      />
      <Tile
        label="Net sentiment"
        value={analyzed ? signed(Math.round(netScore(counts) * 100)) : '–'}
        note="positive minus negative"
      />
      <Tile
        label={SENTIMENT_META.positive.label}
        value={share(counts.positive)}
        note="of analysed articles"
        swatch={SENTIMENT_META.positive.color}
      />
      <Tile
        label={SENTIMENT_META.negative.label}
        value={share(counts.negative)}
        note="of analysed articles"
        swatch={SENTIMENT_META.negative.color}
      />
    </SimpleGrid>
  );
}
