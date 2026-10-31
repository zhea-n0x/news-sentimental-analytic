'use client';

import { LineChart } from '@mantine/charts';
import { usePlotArea, useYAxisScale } from 'recharts';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import { total, type AnalysisResponse, type Counts } from '@/lib/api';
import { ChartCard, type LegendEntry } from './ChartCard';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  title: string;
  trend: AnalysisResponse['trend'];
  /** The overall line plus optional per-source lines (keys match trend.series). */
  series: TrendSeries[];
}

const OVERALL = 'overall';

const fmtNet = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
const net = (c: Counts) => {
  const n = total(c);
  return n ? Math.round(((c.positive - c.negative) / n) * 100) : null;
};

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Jakarta',
});
const hourFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});
const bucketLabel = (iso: string, hours: number) => {
  const d = new Date(iso);
  return hours >= 24 ? dayFmt.format(d) : `${dayFmt.format(d)} ${hourFmt.format(d)}`;
};

type Point = { label: string } & Record<string, string | number | null>;

/** Net sentiment (−100..+100) per time bucket; buckets with nothing analysed are gaps. */
function buildPoints(trend: AnalysisResponse['trend'], series: TrendSeries[]): Point[] {
  return trend.points.map((p, i) => {
    const point: Point = { label: bucketLabel(p.t, trend.bucketHours) };
    for (const s of series) {
      const counts = s.key === OVERALL ? p.counts : trend.series.find((x) => x.key === s.key)?.points[i];
      point[s.key] = counts ? net(counts) : null;
      point[`${s.key}__n`] = counts ? total(counts) : 0;
    }
    return point;
  });
}

function Tip({
  label,
  items,
}: {
  label: string;
  items: { name: string; color: string; value: number; n: number }[];
}) {
  return (
    <Paper withBorder shadow="sm" p="xs" radius="md" bg="var(--viz-surface)">
      <Stack gap={4}>
        <Text size="xs" style={{ color: 'var(--viz-muted)' }}>
          {label}
        </Text>
        {items.map((i) => (
          <Group key={i.name} gap={8} wrap="nowrap">
            <Box w={12} h={3} style={{ background: i.color, borderRadius: 2 }} />
            <Text size="sm" fw={600} style={{ color: 'var(--viz-ink)' }}>
              {fmtNet(i.value)}
            </Text>
            <Text size="xs" style={{ color: 'var(--viz-ink-2)' }}>
              {i.name}
            </Text>
            <Text size="xs" style={{ color: 'var(--viz-muted)' }}>
              ({i.n} analysed)
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

const LABEL_GAP = 15;

/** Series names at the right end of the lines, nudged apart so they never overlap. */
function EndLabels({ items }: { items: { label: string; value: number | null }[] }) {
  const yScale = useYAxisScale();
  const area = usePlotArea();
  if (!yScale || !area) return null;

  const placed = items
    .filter((i) => i.value !== null)
    .map((i) => ({ label: i.label, y: Number(yScale(i.value as number)) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < placed.length; i++) {
    placed[i].y = Math.max(placed[i].y, placed[i - 1].y + LABEL_GAP);
  }

  return (
    <g>
      {placed.map((p) => (
        <text
          key={p.label}
          x={area.x + area.width + 8}
          y={p.y}
          dy={4}
          fontSize={12}
          fill="var(--viz-ink-2)"
        >
          {p.label}
        </text>
      ))}
    </g>
  );
}

const lastValue = (data: Point[], key: string) => {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][key] !== null) return data[i][key] as number;
  }
  return null;
};

export function NetTrendChart({ title, trend, series }: Props) {
  const data = buildPoints(trend, series);
  const hasValues = data.some((p) => series.some((s) => p[s.key] !== null));
  const peak = Math.max(
    20,
    Math.ceil(
      Math.max(0, ...data.flatMap((p) => series.map((s) => Math.abs(Number(p[s.key] ?? 0))))) / 10,
    ) * 10,
  );
  const legend: LegendEntry[] = series.map((s) => ({ label: s.label, color: s.color, kind: 'line' }));
  const unit = trend.bucketHours >= 24 ? 'day' : `${trend.bucketHours} hours`;

  return (
    <ChartCard
      title={title}
      description={`Net sentiment (positive minus negative, % of analysed articles) per ${unit}, WIB`}
      legend={legend}
      table={{
        head: ['Time', ...series.map((s) => s.label)],
        body: [...data]
          .reverse()
          .map((p) => [
            String(p.label),
            ...series.map((s) =>
              p[s.key] === null ? '–' : `${fmtNet(Number(p[s.key]))} (${p[`${s.key}__n`]})`,
            ),
          ]),
      }}
      chart={
        !hasValues ? (
          <Text size="sm" c="dimmed" py="xl" ta="center">
            No analysed articles yet.
          </Text>
        ) : (
          <LineChart
            h={260}
            data={data}
            dataKey="label"
            series={series.map((s) => ({ name: s.key, label: s.label, color: s.color }))}
            curveType="monotone"
            withDots={data.length <= 16}
            strokeWidth={2}
            withLegend={false}
            tickLine="none"
            gridAxis="x"
            strokeDasharray="0"
            gridColor="var(--viz-grid)"
            textColor="var(--viz-muted)"
            connectNulls
            xAxisProps={{ minTickGap: 28, interval: 'preserveStartEnd' }}
            yAxisProps={{
              domain: [-peak, peak],
              tickFormatter: (v: number) => fmtNet(v),
              width: 40,
            }}
            referenceLines={[{ y: 0, color: 'var(--viz-axis)' }]}
            lineChartProps={{
              margin: { top: 8, right: series.length > 1 ? 110 : 12, bottom: 0, left: 0 },
            }}
            tooltipProps={{
              content: ({ label, payload }) =>
                payload?.length ? (
                  <Tip
                    label={String(label)}
                    items={payload
                      .filter((i) => i.value !== null && i.value !== undefined)
                      .map((i) => ({
                        name: series.find((s) => s.key === i.dataKey)?.label ?? String(i.name),
                        color: String(i.color),
                        value: Number(i.value),
                        n: Number((i.payload as Point)[`${String(i.dataKey)}__n`] ?? 0),
                      }))}
                  />
                ) : null,
            }}
          >
            {series.length > 1 && (
              <EndLabels items={series.map((s) => ({ label: s.label, value: lastValue(data, s.key) }))} />
            )}
          </LineChart>
        )
      }
    />
  );
}
