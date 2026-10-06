"use client";

import { Anchor, Paper, SegmentedControl, Table, Text } from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/format";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { PhaseBadge } from "@/ui/status";
import { TimeAgo } from "@/ui/time";
import { LiveRefresh } from "@/ui/live-refresh";

type Row = { id: string; phase: string; ref: string; createdAt: string; familyId: string; title: string; requester: string | null; actorLogin: string | null; runNumber: number | null; durationSeconds: number | null };

export function RunsView({ rows, filter }: { rows: Row[]; filter: string }) {
  const router = useRouter();
  return (
    <>
      <LiveRefresh topics={["runs"]} />
      <PageHeader title="Runs" description="Runs started in FlowDeck and on GitHub." />
      <SegmentedControl
        mb="md"
        value={filter}
        onChange={(v) => router.replace(v === "all" ? "/runs" : `/runs?filter=${v}`)}
        data={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
          { value: "active", label: "Active" },
          { value: "waiting", label: "Waiting" },
          { value: "failed", label: "Failed" },
        ]}
      />
      <Paper>
        {rows.length === 0 ? (
          <EmptyState title="No runs here">Start one from a workflow's page.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Workflow</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Started by</Table.Th>
                  <Table.Th>Branch</Table.Th>
                  <Table.Th>Duration</Table.Th>
                  <Table.Th>When</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Anchor component={Link} href={`/runs/${r.id}`} fw={500} c="var(--mantine-color-text)">
                        {r.title}
                      </Anchor>
                      {r.runNumber && (
                        <Text span c="dimmed" size="sm">
                          {" "}
                          #{r.runNumber}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <PhaseBadge phase={r.phase} size="sm" />
                    </Table.Td>
                    <Table.Td>{r.requester ?? (r.actorLogin ? <Text c="dimmed" size="sm">@{r.actorLogin} on GitHub</Text> : "—")}</Table.Td>
                    <Table.Td className="fd-mono">{r.ref}</Table.Td>
                    <Table.Td c="dimmed">{r.durationSeconds ? formatDuration(r.durationSeconds * 1000) : "—"}</Table.Td>
                    <Table.Td>
                      <TimeAgo at={r.createdAt} size="sm" c="dimmed" />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </>
  );
}
