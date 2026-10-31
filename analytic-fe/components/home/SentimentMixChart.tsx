'use client';

import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { Rectangle, type BarShapeProps } from 'recharts';
import { netScore, total, type Counts } from '@/lib/api';
import { ChartCard, type LegendEntry } from './ChartCard';

export interface MixRow {
  id: string;
  name: string;
  counts: Counts;
  /** CSS color identifying this row (category or source). */
  color: string;
}

interface Props {
  title: string;
  description?: string;
  rows: MixRow[];
  /** What one bar is, for the legend note and table header. */
  noun?: 'category' | 'source';
  /** Makes each bar clickable (drill down). */
  onSelect?: (id: string) => void;
}

const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
const fmtPct = (n: number) => `${Math.round(n)}%`;

interface Datum {
  id: string;
  name: string;
  color: string;
  // Stacked outward from zero: neutral is split across the midline.
  neuL: number;
  negative: number;
  neuR: number;
  positive: number;
  n: number;
  posPct: number;
  neuPct: number;
  negPct: number;
}

function Tip({ d }: { d: Datum }) {
  const rows: [string, number, number][] = [
    ['Positive', d.posPct, 1],
    ['Neutral', d.neuPct, NEUTRAL_OPACITY],
    ['Negative', d.negPct, 1],
  ];
  return (
    <Paper withBorder shadow="sm" p="xs" radius="md" bg="var(--viz-surface)">
      <Stack gap={4}>
        <Group gap={8} wrap="nowrap">
          <Box w={10} h={10} style={{ background: d.color, borderRadius: 2 }} />
          <Text size="sm" fw={600} style={{ color: 'var(--viz-ink)' }}>
            {d.name}
          </Text>
        </Group>
        {rows.map(([label, value, opacity]) => (
          <Group key={label} gap={8} wrap="nowrap">
            <Box
              w={12}
              h={3}
              style={{ background: d.color, opacity, borderRadius: 2 }}
            />
            <Text size="sm" fw={600} style={{ color: 'var(--viz-ink)' }}>
              {fmtPct(value)}
            </Text>
            <Text size="xs" style={{ color: 'var(--viz-ink-2)' }}>
              {label}
            </Text>
          </Group>
        ))}
        <Text size="xs" style={{ color: 'var(--viz-muted)' }}>
          {d.n.toLocaleString('en-US')} articles
        </Text>
      </Stack>
    </Paper>
  );
}

const NEUTRAL_OPACITY = 0.28;

// Each bar takes its own color; the neutral core is the same color, faded.
const solidShape = (props: BarShapeProps) => (
  <Rectangle
    {...props}
    fill={(props.payload as Datum).color}
    stroke="var(--viz-surface)"
    strokeWidth={2}
  />
);
const neutralShape = (props: BarShapeProps) => (
  <Rectangle
    {...props}
    fill={(props.payload as Datum).color}
    fillOpacity={NEUTRAL_OPACITY}
    stroke="var(--viz-surface)"
    strokeWidth={2}
  />
);

/** Diverging stacked bars centred on neutral, one row per category. */
export function SentimentMixChart({
  title,
  description,
  rows: allRows,
  noun = 'category',
  onSelect,
}: Props) {
  // Bars need at least one analysed article; the table lists every row
  const rows = allRows.filter((r) => total(r.counts) > 0);
  const legend: LegendEntry[] = rows.map((r) => ({
    label: r.name,
    color: r.color,
  }));

  const sorted = [...rows].sort(
    (a, b) => netScore(b.counts) - netScore(a.counts),
  );

  const data: Datum[] = sorted.map((r) => {
    const t = total(r.counts);
    const posPct = pct(r.counts.positive, t);
    const neuPct = pct(r.counts.neutral, t);
    const negPct = pct(r.counts.negative, t);
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      neuL: -neuPct / 2,
      negative: -negPct,
      neuR: neuPct / 2,
      positive: posPct,
      n: t,
      posPct,
      neuPct,
      negPct,
    };
  });

  const reach = Math.max(
    30,
    Math.ceil(
      Math.max(...data.map((d) => Math.max(-d.neuL - d.negative, d.neuR + d.positive))) /
        10,
    ) * 10,
  );

  return (
    <ChartCard
      title={title}
      description={description}
      legend={legend}
      legendNote={`Each bar is one ${noun}. Left of the centre line is negative, right of it is positive, and the faded middle is neutral.`}
      table={{
        head: [noun === 'source' ? 'Source' : 'Category', 'Analysed', 'Positive', 'Neutral', 'Negative', 'Net'],
        body: [
          ...data.map((d) => [
          d.name,
          d.n,
          fmtPct(d.posPct),
          fmtPct(d.neuPct),
          fmtPct(d.negPct),
          Math.round(d.posPct - d.negPct),
          ]),
          ...allRows
            .filter((r) => total(r.counts) === 0)
            .map((r) => [r.name, 0, '–', '–', '–', '–']),
        ],
      }}
      chart={
        !data.length ? (
          <Text size="sm" c="dimmed" py="xl" ta="center">
            No analysed articles yet. Results appear here as Gemma works through the queue.
          </Text>
        ) : (
        <BarChart
          h={Math.max(160, data.length * 30 + 40)}
          data={data}
          dataKey="name"
          orientation="vertical"
          type="stacked"
          series={[
            { name: 'neuL', color: 'var(--viz-neu)' },
            { name: 'negative', color: 'var(--viz-muted)' },
            { name: 'neuR', color: 'var(--viz-neu)' },
            { name: 'positive', color: 'var(--viz-muted)' },
          ]}
          withLegend={false}
          tickLine="none"
          gridAxis="y"
          strokeDasharray="0"
          gridColor="var(--viz-grid)"
          textColor="var(--viz-muted)"
          maxBarWidth={16}
          xAxisProps={{
            domain: [-reach, reach],
            tickFormatter: (v: number) => `${Math.abs(v)}%`,
          }}
          yAxisProps={{ width: 140 }}
          barChartProps={{ stackOffset: 'sign' }}
          referenceLines={[{ x: 0, color: 'var(--viz-axis)' }]}
          barProps={(series) => ({
            shape: series.name.startsWith('neu') ? neutralShape : solidShape,
            cursor: onSelect ? 'pointer' : undefined,
            onClick: onSelect
              ? (bar: { payload?: Datum }) =>
                  bar.payload && onSelect(bar.payload.id)
              : undefined,
          })}
          tooltipProps={{
            content: ({ payload }) =>
              payload?.length ? (
                <Tip d={payload[0].payload as Datum} />
              ) : null,
          }}
        />
        )
      }
    />
  );
}
