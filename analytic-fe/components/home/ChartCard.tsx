'use client';

import { useState } from 'react';
import {
  Box,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  VisuallyHidden,
} from '@mantine/core';
import { IconChartBar, IconTable } from '@tabler/icons-react';

export interface LegendEntry {
  label: string;
  color: string;
  kind?: 'rect' | 'line';
}

export interface TableData {
  head: string[];
  body: (string | number)[][];
}

interface Props {
  title: string;
  description?: string;
  legend?: LegendEntry[];
  /** Short reading guide shown under the legend. */
  legendNote?: string;
  chart: React.ReactNode;
  /** Every chart has a table twin. */
  table: TableData;
}

function Legend({ entries }: { entries: LegendEntry[] }) {
  return (
    <Group gap="md" wrap="wrap">
      {entries.map((e) => (
        <Group key={e.label} gap={6} wrap="nowrap">
          <Box
            style={{
              width: e.kind === 'line' ? 14 : 10,
              height: e.kind === 'line' ? 2 : 10,
              borderRadius: 2,
              background: e.color,
            }}
          />
          <Text size="xs" style={{ color: 'var(--viz-ink-2)' }}>
            {e.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function ChartCard({
  title,
  description,
  legend,
  legendNote,
  chart,
  table,
}: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      bg="var(--viz-surface)"
      style={{ minWidth: 0 }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={600} style={{ color: 'var(--viz-ink)' }}>
              {title}
            </Text>
            {description && (
              <Text size="xs" style={{ color: 'var(--viz-ink-2)' }}>
                {description}
              </Text>
            )}
          </div>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as 'chart' | 'table')}
            data={[
              {
                value: 'chart',
                label: (
                  <>
                    <IconChartBar size={14} aria-hidden />
                    <VisuallyHidden>Chart view</VisuallyHidden>
                  </>
                ),
              },
              {
                value: 'table',
                label: (
                  <>
                    <IconTable size={14} aria-hidden />
                    <VisuallyHidden>Table view</VisuallyHidden>
                  </>
                ),
              },
            ]}
          />
        </Group>

        {view === 'chart' ? (
          <>
            {chart}
            {legend && legend.length > 1 && (
              <Stack gap={6}>
                <Legend entries={legend} />
                {legendNote && (
                  <Text size="xs" style={{ color: 'var(--viz-muted)' }}>
                    {legendNote}
                  </Text>
                )}
              </Stack>
            )}
          </>
        ) : (
          <Table.ScrollContainer minWidth={320}>
            <Table
              verticalSpacing={6}
              horizontalSpacing="sm"
              fz="sm"
              data={{ head: table.head, body: table.body }}
            />
          </Table.ScrollContainer>
        )}
      </Stack>
    </Paper>
  );
}
