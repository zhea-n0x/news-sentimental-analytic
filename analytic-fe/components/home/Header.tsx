'use client';

import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Box,
  Group,
  Indicator,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBell,
  IconChartBar,
  IconChevronDown,
  IconHelp,
  IconLogout,
  IconSearch,
  IconSettings,
  IconUser,
} from '@tabler/icons-react';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  /** Category names to suggest, e.g. "Olahraga › Raket". */
  categoryOptions: string[];
  onPickCategory: (label: string) => void;
  user: { name: string; role?: string };
  notifications: number;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export function Header({
  query,
  onQueryChange,
  categoryOptions,
  onPickCategory,
  user,
  notifications,
}: Props) {
  return (
    <Box
      component="header"
      h={64}
      px="lg"
      bg="var(--mantine-color-body)"
      style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Group h="100%" justify="space-between" wrap="nowrap" gap="md">
        <Group gap="xs" wrap="nowrap" style={{ flex: '0 0 auto' }}>
          <IconChartBar size={24} stroke={1.75} />
          <Text fw={600} size="lg" visibleFrom="xs">
            News Sentiment
          </Text>
        </Group>

        <Autocomplete
          value={query}
          onChange={onQueryChange}
          onOptionSubmit={(label) => {
            onPickCategory(label);
            onQueryChange('');
          }}
          data={categoryOptions}
          limit={8}
          placeholder="Search categories…"
          aria-label="Search categories"
          leftSection={<IconSearch size={16} />}
          style={{ flex: 1, maxWidth: 480 }}
        />

        <Group gap="xs" wrap="nowrap" style={{ flex: '0 0 auto' }}>
          <Indicator
            label={notifications}
            size={16}
            offset={4}
            color="red"
            disabled={notifications === 0}
          >
            <ActionIcon variant="default" size="lg" aria-label="Notifications">
              <IconBell size={18} />
            </ActionIcon>
          </Indicator>
          {/* <ActionIcon variant="default" size="lg" aria-label="Help">
            <IconHelp size={18} />
          </ActionIcon> */}

          {/* <Menu position="bottom-end" width={200}>
            <Menu.Target>
              <UnstyledButton ml="xs" aria-label="Account menu">
                <Group gap="xs" wrap="nowrap">
                  <Avatar color="blue" radius="xl" size="md">
                    {initials(user.name)}
                  </Avatar>
                  <Box visibleFrom="md">
                    <Text size="sm" fw={600} lh={1.2}>
                      {user.name}
                    </Text>
                    <Text size="xs" c="dimmed" lh={1.2}>
                      {user.role}
                    </Text>
                  </Box>
                  <IconChevronDown size={16} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconUser size={16} />}>Profile</Menu.Item>
              <Menu.Item leftSection={<IconSettings size={16} />}>
                Settings
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={16} />}>
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu> */}
        </Group>
      </Group>
    </Box>
  );
}
