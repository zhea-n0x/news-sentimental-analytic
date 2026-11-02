'use client';

import { Alert, Badge, Button, Group, Loader, Progress, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconDatabase, IconPlugConnectedX, IconSparkles } from '@tabler/icons-react';
import type { AnalysisResponse, AnalysisStatusResponse } from '@/lib/api';
import { formatDateTime } from './formatDate';

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * How much of the selection Gemma has analysed, how far the backend's queue has got, and what went wrong.
 * `status` is polled separately and is null until it first loads.
 */
export function AnalysisStatus({
  data,
  status,
}: {
  data: AnalysisResponse;
  status: AnalysisStatusResponse | null;
}) {
  const { totals, dataset } = data;
  const share = totals.articles ? (totals.analyzed / totals.articles) * 100 : 0;
  const queueDown = status !== null && !status.redis.connected;
  const busy = status !== null && !queueDown && status.pending > 0;

  if (status && !status.configured) {
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
        {status && (
          <Tooltip
            multiline
            w={300}
            label={`${fmt(status.articles.analyzed)} of ${fmt(status.articles.total)} articles analysed overall, ${fmt(
              status.articles.unanalyzed,
            )} not yet${status.articles.gaveUp ? ` (${fmt(status.articles.gaveUp)} failed too often)` : ''}. New articles are analysed first.`}
          >
            <Group gap={6} wrap="nowrap">
              {busy && status.running && <Loader size={12} />}
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {busy
                  ? `${status.model} · ${fmt(status.pending)} in queue`
                  : `${fmt(status.articles.unanalyzed)} not analysed overall`}
              </Text>
            </Group>
          </Tooltip>
        )}
      </Group>

      {status?.lastError && (
        <Tooltip label={status.lastError} multiline w={360}>
          <Badge color="red" variant="light" radius="sm" leftSection={<IconAlertTriangle size={12} />}>
            {queueDown ? 'Queue offline' : 'Gemma error'}
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
