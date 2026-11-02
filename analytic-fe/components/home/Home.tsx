'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Center,
  Drawer,
  Flex,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowLeft, IconFilter } from '@tabler/icons-react';
import type { ArticleCard } from '@/lib/api';
import { categoryLabel, leavesOf } from '@/lib/taxonomy';
import { AnalysisStatus, ServiceError } from './AnalysisStatus';
import { CategoryDetail } from './CategoryDetail';
import {
  DEFAULT_FILTERS,
  FilterPanel,
  countActive,
  periodLabel,
  type Filters,
} from './FilterPanel';
import { formatDateTime } from './formatDate';
import { Header } from './Header';
import { NewsDetail } from './NewsDetail';
import { Overview } from './Overview';
import { useAnalysis, useAnalysisStatus, useCategories } from './useDashboardData';
import { useNow } from './useNow';

const USER = { name: 'User' };

const greeting = (d: Date) => {
  const h = d.getHours();
  return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
};

const todayLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);

export function Home() {
  // null until hydrated; the greeting shows a skeleton meanwhile.
  const now = useNow();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [article, setArticle] = useState<ArticleCard | null>(null);
  const [drawerOpened, drawer] = useDisclosure(false);
  const [retry, setRetry] = useState(0);

  const categories = useCategories(filters.period, retry);
  // Gemma works through the backend's queue on its own; new results or new articles reload the dashboard
  const status = useAnalysisStatus(retry).data;
  const refresh = status ? `${status.articles.analyzed}|${status.articles.total}` : '';
  const analysis = useAnalysis(filters.categories, filters.period, retry, refresh);
  const taxonomy = categories.index;
  const data = analysis.data;

  // "Olahraga" and "Olahraga › Sepak Bola" style options for the header search.
  const searchOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const root of taxonomy?.roots ?? []) {
      out[root.name] = leavesOf(root);
      for (const child of root.children ?? []) out[categoryLabel(taxonomy!, child.id)] = [child.id];
    }
    return out;
  }, [taxonomy]);

  const selectLeaves = (categories: string[]) =>
    setFilters((f) => ({ ...f, categories }));

  const focus = data?.focus ?? null;
  const title = focus
    ? taxonomy
      ? categoryLabel(taxonomy, focus.id)
      : focus.name
    : filters.categories.length
      ? `${filters.categories.length} categories selected`
      : 'All categories';

  const sourceCount = data?.sources.length ?? 0;
  const active = countActive(filters);
  const error = analysis.error ?? categories.error;

  return (
    <Flex
      direction="column"
      h="100dvh"
      style={{ overflow: 'hidden' }}
      bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))"
    >
      <Header
        query={query}
        onQueryChange={setQuery}
        categoryOptions={Object.keys(searchOptions)}
        onPickCategory={(label) => {
          const ids = searchOptions[label];
          if (ids) selectLeaves(ids);
        }}
        user={USER}
        notifications={12}
      />

      <Box
        className="viz-root"
        w="100%"
        maw={1400}
        mx="auto"
        px="lg"
        pb="lg"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack gap={4} py="lg" style={{ flexShrink: 0 }}>
          <Skeleton visible={!now} w="fit-content">
            <Text size="sm" c="dimmed">
              {now ? todayLabel(now) : 'Saturday, 31 October 2026'}
            </Text>
          </Skeleton>
          <Skeleton visible={!now} w="fit-content">
            <Title order={2}>
              {now ? greeting(now) : 'Good Morning'}, {USER.name}
            </Title>
          </Skeleton>
          <Text c="dimmed">How the news is feeling, by category.</Text>
        </Stack>

        <Flex gap="lg" style={{ flex: 1, minHeight: 0 }}>
          {/* Dashboard: the only scrollable region on the page */}
          <Stack gap="sm" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <Group justify="space-between" wrap="nowrap" style={{ flexShrink: 0 }}>
              <Group gap="xs" wrap="nowrap" align="baseline" style={{ minWidth: 0 }}>
                {focus && (
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<IconArrowLeft size={14} />}
                    onClick={() => selectLeaves([])}
                  >
                    All
                  </Button>
                )}
                <Title order={4} style={{ whiteSpace: 'nowrap' }}>
                  {title}
                </Title>
                <Text size="sm" c="dimmed" visibleFrom="sm" style={{ whiteSpace: 'nowrap' }}>
                  Last {periodLabel(filters.period)}
                  {data ? ` to ${formatDateTime(data.period.to)}` : ''}
                  {data ? ` · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : ''}
                </Text>
                {(analysis.loading || categories.loading) && data && <Loader size={14} />}
              </Group>
              <Group gap="xs" wrap="nowrap">
                <Button
                  hiddenFrom="md"
                  variant="default"
                  size="xs"
                  leftSection={<IconFilter size={14} />}
                  onClick={drawer.open}
                >
                  Filters{active > 0 ? ` (${active})` : ''}
                </Button>
              </Group>
            </Group>

            {data && <AnalysisStatus data={data} status={status} />}

            <ScrollArea
              style={{ flex: 1, minHeight: 0 }}
              scrollbars="y"
              offsetScrollbars="y"
              type="auto"
            >
              <Box pb="xs">
                {error && (
                  <ServiceError
                    message={error.message}
                    unreachable={error.unreachable}
                    onRetry={() => setRetry((n) => n + 1)}
                  />
                )}
                {data && taxonomy ? (
                  focus ? (
                    <CategoryDetail
                      key={focus.id}
                      data={data}
                      index={taxonomy}
                      onSelectLeaves={selectLeaves}
                      onOpenArticle={setArticle}
                    />
                  ) : (
                    <Overview data={data} index={taxonomy} onSelectLeaves={selectLeaves} />
                  )
                ) : (
                  !error && (
                    <Center h={240}>
                      <Loader />
                    </Center>
                  )
                )}
              </Box>
            </ScrollArea>
          </Stack>

          <Paper
            withBorder
            p="lg"
            w={300}
            visibleFrom="md"
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <FilterPanel
              value={filters}
              onChange={setFilters}
              taxonomy={taxonomy}
              periods={categories.data?.periods}
            />
          </Paper>
        </Flex>
      </Box>

      <Drawer
        opened={drawerOpened}
        onClose={drawer.close}
        position="right"
        size={300}
        hiddenFrom="md"
      >
        <FilterPanel
          value={filters}
          onChange={setFilters}
          taxonomy={taxonomy}
          periods={categories.data?.periods}
          scrollable={false}
        />
      </Drawer>

      <NewsDetail
        article={article}
        model={status?.model}
        onClose={() => setArticle(null)}
      />
    </Flex>
  );
}
