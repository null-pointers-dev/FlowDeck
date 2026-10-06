"use client";

import { Alert, Badge, Button, Group, Paper, SimpleGrid, Table, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import type { health } from "../server/overview";
import { pollNowAction, retryFailedAction, syncCatalogAction } from "../server/actions";
import { TimeAgo } from "@/ui/time";
import { useServerAction } from "@/ui/use-server-action";
import { LiveRefresh } from "@/ui/live-refresh";

type Data = Awaited<ReturnType<typeof health>>;

export function HealthView({ data }: { data: Data }) {
  const router = useRouter();
  const [sync, syncing] = useServerAction(syncCatalogAction, { success: "Catalog sync started" });
  const [poll, polling] = useServerAction(pollNowAction, { success: "Checking all active runs" });
  const [retry] = useServerAction(retryFailedAction, { success: "Retrying failed jobs", onSuccess: () => router.refresh() });
  const workerLate = !data.heartbeat || Date.now() - data.heartbeat.at > 150_000;
  const expiring = data.connections.filter((c) => c.status !== "healthy");

  return (
    <>
      <LiveRefresh topics={["runs"]} />
      {workerLate && (
        <Alert color="red" mb="lg" title="The worker isn't checking in">
          Runs, approvals and syncs won't progress until the worker is running.
        </Alert>
      )}
      {expiring.length > 0 && (
        <Alert color="yellow" mb="lg" title="Connections need attention">
          {expiring.map((c) => `${c.name} (${c.status})`).join(", ")}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="xl">
        <Paper p="lg">
          <Text size="sm" c="dimmed">Worker</Text>
          <Text fz={22} fw={650}>{data.heartbeat ? <TimeAgo at={new Date(data.heartbeat.at).toISOString()} /> : "Never"}</Text>
          <Text size="xs" c="dimmed">{data.heartbeat ? `${data.heartbeat.active} unfinished runs at last check` : "Start it with npm run worker"}</Text>
        </Paper>
        <Paper p="lg">
          <Text size="sm" c="dimmed">Last webhook</Text>
          <Text fz={22} fw={650}>{data.lastWebhookAt ? <TimeAgo at={data.lastWebhookAt} /> : "None yet"}</Text>
          <Text size="xs" c="dimmed">The minute check covers any gap</Text>
        </Paper>
        <Paper p="lg">
          <Text size="sm" c="dimmed">Catalog</Text>
          <Text fz={22} fw={650}>{data.catalog.total} workflows</Text>
          <Text size="xs" c="dimmed">{data.catalog.documented} documented</Text>
        </Paper>
        <Paper p="lg">
          <Text size="sm" c="dimmed">Actions</Text>
          <Group gap="xs" mt={6}>
            <Button size="xs" variant="default" loading={syncing} onClick={() => sync({})}>Sync catalog</Button>
            <Button size="xs" variant="default" loading={polling} onClick={() => poll({})}>Check runs</Button>
          </Group>
        </Paper>
      </SimpleGrid>

      <Paper p="lg" mb="xl">
        <Title order={4} mb="sm">Background work</Title>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Queue</Table.Th>
              <Table.Th ta="right">Waiting</Table.Th>
              <Table.Th ta="right">Running</Table.Th>
              <Table.Th ta="right">Scheduled</Table.Th>
              <Table.Th ta="right">Failed</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.queues.map((q) => (
              <Table.Tr key={q.name}>
                <Table.Td className="fd-mono">{q.name}</Table.Td>
                <Table.Td ta="right">{q.counts?.waiting ?? "—"}</Table.Td>
                <Table.Td ta="right">{q.counts?.active ?? "—"}</Table.Td>
                <Table.Td ta="right">{q.counts?.delayed ?? "—"}</Table.Td>
                <Table.Td ta="right">{q.counts?.failed ? <Badge color="red">{q.counts.failed}</Badge> : q.counts?.failed ?? "—"}</Table.Td>
                <Table.Td ta="right">{q.counts?.failed ? <Button size="xs" variant="subtle" onClick={() => retry({ queue: q.name })}>Retry</Button> : null}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {data.failedWebhooks.length > 0 && (
        <Paper p="lg">
          <Title order={4} mb="sm">Webhooks that failed to process</Title>
          {data.failedWebhooks.map((f) => (
            <Group key={f.id} justify="space-between" py={4}>
              <Text size="sm">{f.event}: <Text span c="red">{f.error}</Text></Text>
              <TimeAgo at={f.at} size="xs" c="dimmed" />
            </Group>
          ))}
        </Paper>
      )}
    </>
  );
}
