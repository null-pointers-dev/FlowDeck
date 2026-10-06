"use client";

import { Button, Code, Group, Paper, Table, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { TimeAgo } from "@/ui/time";

type Row = { id: string; actorName: string | null; action: string; resourceType: string; resourceId: string | null; data: Record<string, unknown>; createdAt: string };

export function AuditView({ rows, q }: { rows: Row[]; q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  const go = useDebouncedCallback((v: string) => router.replace(v ? `${pathname}?q=${encodeURIComponent(v)}` : pathname), 300);
  return (
    <>
      <Group justify="space-between" mb="md">
        <TextInput leftSection={<IconSearch size={16} />} placeholder="Filter by action, person or id" w={360} value={text} onChange={(e) => { setText(e.currentTarget.value); go(e.currentTarget.value); }} />
        <Button component="a" href={`/api/admin/audit.csv${q ? `?q=${encodeURIComponent(q)}` : ""}`} variant="default" leftSection={<IconDownload size={16} />}>
          Export CSV
        </Button>
      </Group>
      <Paper>
        <Table.ScrollContainer minWidth={820}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Who</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Resource</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td><TimeAgo at={r.createdAt} size="sm" /></Table.Td>
                  <Table.Td>{r.actorName ?? "FlowDeck"}</Table.Td>
                  <Table.Td className="fd-mono">{r.action}</Table.Td>
                  <Table.Td><Text size="sm">{r.resourceType}</Text><Text size="xs" c="dimmed" className="fd-mono">{r.resourceId}</Text></Table.Td>
                  <Table.Td maw={360}>{Object.keys(r.data).length ? <Code block style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{JSON.stringify(r.data, null, 1)}</Code> : "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </>
  );
}
