'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Flex,
  Group,
  ScrollArea,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconChevronRight,
  IconFilter,
  IconFilterOff,
} from '@tabler/icons-react';
import type { CategoryNode } from '@/lib/api';
import { leavesOf, type TaxonomyIndex } from '@/lib/taxonomy';

export interface Filters {
  /** Selected leaf category ids. Empty = all categories. */
  categories: string[];
  /** Days back from now. */
  period: number;
}

export const PERIODS = [1, 3, 7, 30];
export const DEFAULT_PERIOD = 7;

export const periodLabel = (days: number) =>
  days === 1 ? '24 hours' : `${days} days`;

export const DEFAULT_FILTERS: Filters = {
  categories: [],
  period: DEFAULT_PERIOD,
};

export const countActive = (f: Filters) =>
  f.categories.length + (f.period !== DEFAULT_PERIOD ? 1 : 0);

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
  /** Category tree with counts for the period; null while loading. */
  taxonomy: TaxonomyIndex | null;
  periods?: number[];
  /** Scroll inside the panel (desktop sidebar). Off inside a drawer, which scrolls itself. */
  scrollable?: boolean;
}

const sourcesTitle = (c: CategoryNode) =>
  c.sources.length ? `Sources: ${c.sources.join(', ')}` : 'No articles in this period';

function CategoryRow({
  category,
  selected,
  open,
  onToggleOpen,
  onToggleLeaves,
}: {
  category: CategoryNode;
  selected: Set<string>;
  open: boolean;
  onToggleOpen: () => void;
  onToggleLeaves: (ids: string[], on: boolean) => void;
}) {
  const leaves = leavesOf(category);
  const picked = leaves.filter((id) => selected.has(id)).length;
  const checked = picked === leaves.length;
  const children = category.children ?? [];
  const hasChildren = children.length > 0;

  return (
    <div>
      <Group gap={4} wrap="nowrap" justify="space-between">
        <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {hasChildren ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size={22}
              onClick={onToggleOpen}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${category.name}`}
              aria-expanded={open}
            >
              <IconChevronRight
                size={14}
                style={{
                  transform: open ? 'rotate(90deg)' : undefined,
                  transition: 'transform 120ms ease',
                }}
              />
            </ActionIcon>
          ) : (
            <Box w={22} style={{ flexShrink: 0 }} />
          )}
          <Checkbox
            size="xs"
            label={category.name}
            title={sourcesTitle(category)}
            checked={checked}
            indeterminate={picked > 0 && !checked}
            onChange={() => onToggleLeaves(leaves, !checked)}
          />
        </Group>
        <Text size="xs" c="dimmed">
          {category.articles.toLocaleString('en-US')}
        </Text>
      </Group>

      {hasChildren && (
        <Collapse expanded={open}>
          <Stack gap={8} pl={34} pt={8} pb={4}>
            {children.map((child) => (
              <Group key={child.id} justify="space-between" wrap="nowrap">
                <Checkbox
                  size="xs"
                  label={child.name}
                  title={sourcesTitle(child)}
                  checked={selected.has(child.id)}
                  onChange={(e) =>
                    onToggleLeaves([child.id], e.currentTarget.checked)
                  }
                />
                <Text size="xs" c="dimmed">
                  {child.articles.toLocaleString('en-US')}
                </Text>
              </Group>
            ))}
          </Stack>
        </Collapse>
      )}
    </div>
  );
}

export function FilterPanel({
  value,
  onChange,
  taxonomy,
  periods = PERIODS,
  scrollable = true,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const active = countActive(value);
  const selected = useMemo(() => new Set(value.categories), [value.categories]);

  const toggleLeaves = (ids: string[], on: boolean) => {
    const next = new Set(value.categories);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange({ ...value, categories: [...next] });
  };

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const body = (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lh={1}>
          Period
        </Text>
        <SegmentedControl
          fullWidth
          size="xs"
          value={String(value.period)}
          onChange={(v) => onChange({ ...value, period: Number(v) })}
          data={periods.map((p) => ({ value: String(p), label: periodLabel(p) }))}
        />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lh={1}>
          Category
        </Text>
        <Stack gap={8}>
          {taxonomy
            ? taxonomy.roots.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  selected={selected}
                  open={open.has(cat.id)}
                  onToggleOpen={() => toggleOpen(cat.id)}
                  onToggleLeaves={toggleLeaves}
                />
              ))
            : Array.from({ length: 10 }, (_, i) => <Skeleton key={i} h={18} />)}
        </Stack>
      </Stack>
    </Stack>
  );

  return (
    <Flex direction="column" gap="md" style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs">
          <IconFilter size={18} stroke={1.75} />
          <Text fw={600}>Filters</Text>
          {active > 0 && (
            <Badge size="sm" circle>
              {active}
            </Badge>
          )}
        </Group>
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconFilterOff size={14} />}
          onClick={() => onChange(DEFAULT_FILTERS)}
          disabled={active === 0}
        >
          Reset
        </Button>
      </Group>

      {scrollable ? (
        <ScrollArea
          style={{ flex: 1, minHeight: 0 }}
          type="auto"
          offsetScrollbars="y"
        >
          {body}
        </ScrollArea>
      ) : (
        body
      )}
    </Flex>
  );
}
