"use client";

import { ActionIcon, Anchor, Badge, Button, Card, Group, Menu, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { Sparkline } from "@mantine/charts";
import { IconArrowDown, IconArrowUp, IconDots, IconPinnedOff, IconPlayerPlay, IconShieldCheck } from "@tabler/icons-react";
import Link from "next/link";
import type { DashboardCard } from "../server/insights";
import { moveDashboardItemAction, unpinAction } from "../server/actions";
import { formatDuration } from "@/lib/format";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { PhaseBadge, PhaseDot } from "@/ui/status";
import { TimeAgo } from "@/ui/time";
import { useServerAction } from "@/ui/use-server-action";
import { LiveRefresh } from "@/ui/live-refresh";

type Props = {
  name: string;
  tiles: { runsThisWeek: number; successRate: number | null; medianApprovalWaitSeconds: number | null };
  cards: DashboardCard[];
  recent: Array<{ family: { id: string; title: string; summary: string; category: string | null }; last: string }>;
  active: Array<{ id: string; phase: string; ref: string; title: string; createdAt: string }>;
  waiting: Array<{ id: string; runRequestId: string; title: string; environment: string; createdAt: string }>;
};

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Paper p="lg">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={28} fw={650} lh={1.2} mt={4}>
        {value}
      </Text>
      <Text size="xs" c="dimmed" mt={4}>
        {hint}
      </Text>
    </Paper>
  );
}

function PinnedCard({ card }: { card: DashboardCard }) {
  const [unpin] = useServerAction(unpinAction, { success: "Removed from your dashboard" });
  const [move] = useServerAction(moveDashboardItemAction);
  const runHref = `/workflows/${card.familyId}?ref=${encodeURIComponent(card.ref)}${card.savedInputName ? `&preset=${encodeURIComponent(card.savedInputName)}` : ""}#run`;
  return (
    <Card>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Anchor component={Link} href={`/workflows/${card.familyId}`} fw={600} c="var(--mantine-color-text)" truncate>
            {card.title}
          </Anchor>
          <Group gap={6}>
            <Badge variant="default" className="fd-mono">
              {card.ref}
            </Badge>
            {card.savedInputName && <Badge variant="light">{card.savedInputName}</Badge>}
          </Group>
        </Stack>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label="Card options">
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconArrowUp size={16} />} onClick={() => move({ id: card.id, direction: "up" })}>
              Move up
            </Menu.Item>
            <Menu.Item leftSection={<IconArrowDown size={16} />} onClick={() => move({ id: card.id, direction: "down" })}>
              Move down
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconPinnedOff size={16} />} onClick={() => unpin({ id: card.id })}>
              Remove from dashboard
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Group justify="space-between" mt="md" wrap="nowrap">
        {card.lastRun ? (
          <Anchor component={Link} href={`/runs/${card.lastRun.id}`} underline="never">
            <Group gap={8}>
              <PhaseDot phase={card.lastRun.phase} />
              <TimeAgo at={card.lastRun.at} size="sm" c="dimmed" />
            </Group>
          </Anchor>
        ) : (
          <Text size="sm" c="dimmed">
            No runs on this branch yet
          </Text>
        )}
      </Group>

      <Group mt="md" gap="xl" wrap="nowrap" align="flex-end">
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            Success, 30 days
          </Text>
          <Text fw={600}>{card.successRate === null ? "—" : `${card.successRate}%`}</Text>
        </Stack>
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            Typical time
          </Text>
          <Text fw={600}>{card.medianSeconds ? formatDuration(card.medianSeconds * 1000) : "—"}</Text>
        </Stack>
        {card.durations.length > 2 && <Sparkline flex={1} h={36} data={card.durations} curveType="monotone" color="brand" fillOpacity={0.15} strokeWidth={1.5} />}
      </Group>

      <Button component={Link} href={runHref} mt="lg" variant="light" leftSection={<IconPlayerPlay size={16} />} fullWidth>
        {card.savedInputName ? `Run with ${card.savedInputName}` : "Run"}
      </Button>
    </Card>
  );
}

export function HomeView({ name, tiles, cards, recent, active, waiting }: Props) {
  const first = name.split(/\s+/)[0];
  return (
    <>
      <LiveRefresh topics={["runs", "approvals"]} />
      <PageHeader title={`Welcome back, ${first}`} description="Your workflows, what's running, and what needs you." />

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
        <Tile label="Your runs this week" value={String(tiles.runsThisWeek)} hint="Started by you in the last 7 days" />
        <Tile label="Your success rate" value={tiles.successRate === null ? "—" : `${tiles.successRate}%`} hint="Finished runs, last 30 days" />
        <Tile label="Typical approval wait" value={tiles.medianApprovalWaitSeconds === null ? "—" : formatDuration(tiles.medianApprovalWaitSeconds * 1000)} hint="Median, on your runs, last 30 days" />
      </SimpleGrid>

      {waiting.length > 0 && (
        <Paper p="lg" mb="xl" style={{ borderColor: "var(--mantine-color-yellow-4)" }}>
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <ThemeIcon color="yellow" variant="light" radius="xl">
                <IconShieldCheck size={16} />
              </ThemeIcon>
              <Title order={4}>Waiting on you</Title>
            </Group>
            <Anchor component={Link} href="/approvals" size="sm">
              Open approvals
            </Anchor>
          </Group>
          <Stack gap="xs">
            {waiting.map((w) => (
              <Group key={w.id} justify="space-between">
                <Anchor component={Link} href={`/runs/${w.runRequestId}`} c="var(--mantine-color-text)">
                  {w.title} to <b>{w.environment}</b>
                </Anchor>
                <TimeAgo at={w.createdAt} size="sm" c="dimmed" />
              </Group>
            ))}
          </Stack>
        </Paper>
      )}

      <Group justify="space-between" mb="sm">
        <Title order={4}>My dashboard</Title>
        <Text size="sm" c="dimmed">
          Pin a workflow and branch from its page
        </Text>
      </Group>
      {cards.length === 0 ? (
        <Paper mb="xl">
          <EmptyState title="Nothing pinned yet" action={<Button component={Link} href="/workflows" variant="light" mt="sm">Browse workflows</Button>}>
            Open a workflow you use often and choose Pin to dashboard. You'll see its last run, success rate and timing here, with a one-click run.
          </EmptyState>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} mb="xl">
          {cards.map((c) => (
            <PinnedCard key={c.id} card={c} />
          ))}
        </SimpleGrid>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper p="lg">
          <Title order={4} mb="sm">
            Recently used
          </Title>
          {recent.length === 0 ? (
            <Text size="sm" c="dimmed">
              Workflows you open or run will show up here.
            </Text>
          ) : (
            <Stack gap="sm">
              {recent.map((r) => (
                <Group key={r.family.id} justify="space-between" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Anchor component={Link} href={`/workflows/${r.family.id}`} fw={500} c="var(--mantine-color-text)" truncate>
                      {r.family.title}
                    </Anchor>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {r.family.summary}
                    </Text>
                  </Stack>
                  <TimeAgo at={r.last} size="xs" c="dimmed" />
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
        <Paper p="lg">
          <Title order={4} mb="sm">
            Your active runs
          </Title>
          {active.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nothing running right now.
            </Text>
          ) : (
            <Stack gap="sm">
              {active.map((r) => (
                <Group key={r.id} justify="space-between" wrap="nowrap">
                  <Anchor component={Link} href={`/runs/${r.id}`} c="var(--mantine-color-text)" truncate>
                    {r.title} <Text span c="dimmed" className="fd-mono">{r.ref}</Text>
                  </Anchor>
                  <PhaseBadge phase={r.phase} size="sm" />
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
    </>
  );
}
