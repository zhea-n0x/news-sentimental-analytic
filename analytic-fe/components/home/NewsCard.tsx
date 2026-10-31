'use client';

import { Card, Group, Stack, Text } from '@mantine/core';
import type { ArticleCard } from '@/lib/api';
import { formatDateTime } from './formatDate';
import { SentimentBadge } from './SentimentBadge';
import { Thumbnail } from './Thumbnail';

interface Props {
  article: ArticleCard;
  onOpen: (article: ArticleCard) => void;
}

export function NewsCard({ article, onOpen }: Props) {
  return (
    <Card
      className="news-card"
      component="button"
      type="button"
      withBorder
      padding={0}
      radius="md"
      onClick={() => onOpen(article)}
      style={{
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        font: 'inherit',
        color: 'inherit',
        background: 'var(--viz-surface)',
      }}
    >
      <Thumbnail src={article.imageUrl} />
      <Stack gap="xs" p="md" style={{ flex: 1 }}>
        <Group justify="space-between" wrap="nowrap">
          <SentimentBadge sentiment={article.sentiment?.label ?? null} />
          {article.publishedAt && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {formatDateTime(article.publishedAt)}
            </Text>
          )}
        </Group>
        <Text fw={600} lineClamp={2}>
          {article.title}
        </Text>
        {article.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {article.description}
          </Text>
        )}
        <Text size="xs" c="dimmed" truncate mt="auto" pt="xs">
          <Text span inherit fw={600} c="var(--viz-ink-2)">
            {article.portal.name}
          </Text>{' '}
          · {article.category.name}
        </Text>
      </Stack>
    </Card>
  );
}
