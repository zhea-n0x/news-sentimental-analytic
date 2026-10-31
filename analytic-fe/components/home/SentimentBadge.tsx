'use client';

import { Badge, Box, Loader } from '@mantine/core';
import type { Sentiment } from '@/lib/api';
import { SENTIMENT_META } from './categoryMeta';

/** Dot + label, so sentiment never relies on color alone. Null = not analysed yet. */
export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) {
    return (
      <Badge
        variant="default"
        size="sm"
        radius="sm"
        c="dimmed"
        leftSection={<Loader size={8} color="gray" />}
      >
        Pending
      </Badge>
    );
  }
  const { label, color } = SENTIMENT_META[sentiment];
  return (
    <Badge
      variant="default"
      size="sm"
      radius="sm"
      leftSection={
        <Box w={8} h={8} style={{ background: color, borderRadius: 2 }} />
      }
    >
      {label}
    </Badge>
  );
}
