'use client';

import { Alert, Badge, Button, Group, Loader, Progress, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconDatabase, IconPlugConnectedX, IconSparkles } from '@tabler/icons-react';
import type { AnalysisResponse } from '@/lib/api';
import { formatDateTime } from './formatDate';

const fmt = (n: number) => n.toLocaleString('en-US');

/** How much of the selection Gemma has analysed, what it is working on, and what went wrong. */
export function AnalysisStatus({
  data,
  onAnalyzeAll,
}: {
  data: AnalysisResponse;
  onAnalyzeAll: () => void;
}) {
  const { totals, analysis, dataset } = data;
  const share = totals.articles ? (totals.analyzed / totals.articles) * 100 : 0;
  const busy = analysis.pending > 0;

  if (!analysis.configured) {
    return (
      <Alert
        variant="light"
        color="yellow"
        icon={<IconAlertTriangle size={18} />}
        title="Sentiment analysis is off"
        style={{ flexShrink: 0 }}
      >
        Add <code>GEMINI_API_KEY</code> to <code>analytic-be/.env</code> and restart the backend. Charts only count
        articles that have been analysed.
      </Alert>
    );
  }

  return (
    <Group gap="sm" wrap="wrap" style={{ flexShrink: 0 }}>
      <Group gap={8} wrap="nowrap" style={{ flex: 1, minWidth: 220 }}>
        <IconSparkles size={16} stroke={1.75} color="var(--viz-muted)" />
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {fmt(totals.analyzed)} of {fmt(totals.articles)} analysed
        </Text>
        <Progress value={share} size="sm" w={120} aria-label="Share of articles analysed" />
        {busy && (
          <Group gap={6} wrap="nowrap">
            <Loader size={12} />
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {analysis.model} is analysing {fmt(analysis.pending)}
            </Text>
          </Group>
        )}
      </Group>

      {analysis.lastError && (
        <Tooltip label={analysis.lastError} multiline w={360}>
          <Badge color="red" variant="light" radius="sm" leftSection={<IconAlertTriangle size={12} />}>
            Gemma error
          </Badge>
        </Tooltip>
      )}
      <Tooltip
        multiline
        w={300}
        label={`${fmt(dataset.articles)} articles from ${
          dataset.source === 'mongodb' ? 'MongoDB' : `the ${dataset.name} backup`
        }${dataset.exportedAt ? `, exported ${formatDateTime(dataset.exportedAt)}` : ''}${
          dataset.fallbackReason ? ` (MongoDB is not available: ${dataset.fallbackReason})` : ''
        }. Periods count back from the newest article${
          dataset.latestArticleAt ? ` (${formatDateTime(dataset.latestArticleAt)})` : ''
        }.`}
      >
        <Badge
          color={dataset.fallbackReason ? 'yellow' : 'gray'}
          variant="light"
          radius="sm"
          leftSection={<IconDatabase size={12} />}
        >
          {dataset.name}
        </Badge>
      </Tooltip>
      {!busy && analysis.remaining > 0 && (
        <Button size="compact-xs" variant="light" onClick={onAnalyzeAll}>
          Analyse {analysis.remaining > 1000 ? 'next 1,000' : `remaining ${fmt(analysis.remaining)}`}
        </Button>
      )}
    </Group>
  );
}

export function ServiceError({
  message,
  unreachable,
  onRetry,
}: {
  message: string;
  unreachable: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert
      variant="light"
      color="red"
      icon={<IconPlugConnectedX size={18} />}
      title="Can't load the analysis"
      mb="md"
    >
      <Text size="sm">{message}</Text>
      {unreachable && (
        <Text size="sm" c="dimmed" mt={4}>
          Start the backend with <code>bun run dev</code> in <code>analytic-be</code> (it listens on port 4000).
        </Text>
      )}
      <Button size="compact-sm" variant="light" color="red" mt="sm" onClick={onRetry}>
        Try again
      </Button>
    </Alert>
  );
}
