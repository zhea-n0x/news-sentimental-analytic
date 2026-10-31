'use client';

import { Anchor, Group, Modal, Paper, Stack, Text, Title } from '@mantine/core';
import { IconExternalLink, IconSparkles } from '@tabler/icons-react';
import type { ArticleCard } from '@/lib/api';
import { formatDateTime } from './formatDate';
import { SentimentBadge } from './SentimentBadge';
import { Thumbnail } from './Thumbnail';

interface Props {
  article: ArticleCard | null;
  model?: string;
  onClose: () => void;
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

export function NewsDetail({ article, model, onClose }: Props) {
  return (
    <Modal
      opened={!!article}
      onClose={onClose}
      size="lg"
      padding="lg"
      // The modal is portalled out of .viz-root; give it the chart tokens too
      classNames={{ content: 'viz-root' }}
      title={
        article && (
          <Text size="sm" c="dimmed">
            {article.portal.name} · {article.category.name}
          </Text>
        )
      }
    >
      {article && (
        <Stack gap="md">
          <Thumbnail src={article.imageUrl} ratio={21 / 9} />
          <div>
            <Title order={3}>{article.title}</Title>
            <Group gap="xs" mt={6}>
              <SentimentBadge sentiment={article.sentiment?.label ?? null} />
              {article.sentiment && (
                <Text size="sm" c="dimmed">
                  Score {signed(article.sentiment.score)}
                </Text>
              )}
              {article.publishedAt && (
                <Text size="sm" c="dimmed">
                  · {formatDateTime(article.publishedAt)}
                </Text>
              )}
            </Group>
          </div>

          {article.sentiment?.reason && (
            <Paper withBorder p="sm" radius="md" bg="var(--viz-surface)">
              <Group gap={6} mb={4} wrap="nowrap">
                <IconSparkles size={14} stroke={1.75} />
                <Text size="xs" c="dimmed">
                  Why {article.sentiment.label}{model ? ` (${model})` : ''}
                </Text>
              </Group>
              <Text size="sm">{article.sentiment.reason}</Text>
            </Paper>
          )}

          {article.description && <Text size="sm">{article.description}</Text>}

          <Anchor href={article.url} target="_blank" rel="noreferrer" size="sm">
            <Group gap={4} wrap="nowrap" component="span">
              Read the full article on {article.portal.name}
              <IconExternalLink size={14} />
            </Group>
          </Anchor>
        </Stack>
      )}
    </Modal>
  );
}
