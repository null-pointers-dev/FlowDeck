"use client";

import { Alert, Badge, Button, Drawer, Group, Paper, Progress, SegmentedControl, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconPlus } from "@tabler/icons-react";
import { recheckConnectionAction, removeConnectionAction, saveConnectionAction } from "../server/actions";
import { EmptyState } from "@/ui/page-header";
import { TimeAgo } from "@/ui/time";
import { useServerAction } from "@/ui/use-server-action";

export type ConnectionRow = {
  id: string;
  name: string;
  owner: string;
  kind: string;
  purpose: string;
  appId: string | null;
  actsAs: string | null;
  status: string;
  lastError: string | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  quota: { remaining: number; limit: number } | null;
};
type Row = ConnectionRow;
const STATUS: Record<string, { color: string; label: string }> = {
  healthy: { color: "teal", label: "Healthy" },
  checking: { color: "blue", label: "Checking" },
  expiring: { color: "yellow", label: "Expiring soon" },
  error: { color: "red", label: "Not working" },
};

export function ConnectionsView({ rows }: { rows: Row[] }) {
  const [opened, drawer] = useDisclosure(false);
  const form = useForm({ initialValues: { owner: "", purpose: "dispatch" as "dispatch" | "approver", kind: "pat" as "pat" | "app", name: "", token: "", appId: "", installationId: "", privateKey: "" } });
  const [save, saving] = useServerAction(saveConnectionAction, {
    success: "Saved. Checking it now.",
    onSuccess: () => {
      drawer.close();
      form.reset();
    },
    onError: (e) => e.fieldErrors && form.setErrors(e.fieldErrors),
  });
  const [recheck] = useServerAction(recheckConnectionAction, { success: "Checking" });
  const [remove] = useServerAction(removeConnectionAction, { success: "Removed" });
  const v = form.getValues();

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm" maw={680}>
          Each GitHub organisation needs a runs connection. Add an approver token, from an account that is a required reviewer, to approve deployments from FlowDeck.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={drawer.open}>
          Add connection
        </Button>
      </Group>

      <Paper>
        {rows.length === 0 ? (
          <EmptyState title="No connections yet">Add one and FlowDeck will sync the catalog from your DevOps repository.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={860}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Connection</Table.Th>
                  <Table.Th>Used for</Table.Th>
                  <Table.Th>Acts as</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>API quota</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text fw={600}>{c.owner}</Text>
                      <Text size="xs" c="dimmed">
                        {c.name} · {c.kind === "app" ? `GitHub App ${c.appId}` : "Personal access token"}
                      </Text>
                    </Table.Td>
                    <Table.Td>{c.purpose === "approver" ? "Approving deployments" : "Sync, runs, cancel, rerun"}</Table.Td>
                    <Table.Td className="fd-mono">{c.actsAs ? `@${c.actsAs}` : "—"}</Table.Td>
                    <Table.Td>
                      <Badge color={STATUS[c.status]?.color ?? "gray"}>{STATUS[c.status]?.label ?? c.status}</Badge>
                      {c.expiresAt && <Text size="xs" c="dimmed">Expires {new Date(c.expiresAt).toLocaleDateString()}</Text>}
                      {c.lastError && <Text size="xs" c="red" maw={260}>{c.lastError}</Text>}
                      {c.lastCheckedAt && <Text size="xs" c="dimmed">Checked <TimeAgo at={c.lastCheckedAt} /></Text>}
                    </Table.Td>
                    <Table.Td w={160}>
                      {c.quota ? (
                        <>
                          <Text size="xs">{c.quota.remaining.toLocaleString()} of {c.quota.limit.toLocaleString()}</Text>
                          <Progress value={(c.quota.remaining / Math.max(1, c.quota.limit)) * 100} size="sm" mt={4} />
                        </>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="subtle" onClick={() => recheck({ id: c.id })}>Check</Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() =>
                            modals.openConfirmModal({
                              title: `Remove ${c.name}?`,
                              children: <Text size="sm">{c.purpose === "dispatch" ? "Runs, syncs and status updates for this organisation stop until a new connection is added." : "Approving from FlowDeck stops working for this organisation."}</Text>,
                              labels: { confirm: "Remove", cancel: "Cancel" },
                              confirmProps: { color: "red" },
                              onConfirm: () => remove({ id: c.id }),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Drawer opened={opened} onClose={drawer.close} position="right" size="md" title={<Title order={4}>Add or replace a connection</Title>}>
        <form onSubmit={form.onSubmit((values) => save(values))}>
          <Stack>
            <TextInput label="GitHub organisation or user" placeholder="acme" required classNames={{ input: "fd-mono" }} {...form.getInputProps("owner")} />
            <Stack gap={4}>
              <Text size="sm" fw={500}>Used for</Text>
              <SegmentedControl data={[{ value: "dispatch", label: "Runs and sync" }, { value: "approver", label: "Approvals" }]} {...form.getInputProps("purpose")} />
            </Stack>
            {v.purpose === "dispatch" && (
              <Stack gap={4}>
                <Text size="sm" fw={500}>Type</Text>
                <SegmentedControl data={[{ value: "pat", label: "Personal access token" }, { value: "app", label: "GitHub App" }]} {...form.getInputProps("kind")} />
              </Stack>
            )}
            <TextInput label="Label" placeholder="Optional" {...form.getInputProps("name")} />
            {v.kind === "pat" || v.purpose === "approver" ? (
              <TextInput
                label="Token"
                type="password"
                autoComplete="off"
                classNames={{ input: "fd-mono" }}
                description={v.purpose === "approver" ? "From an account listed as a required reviewer, and not the runs account (GitHub blocks self-review)." : "Fine-grained: Actions read/write, Contents read, Deployments read, Environments read; Members read for team reviewers."}
                {...form.getInputProps("token")}
              />
            ) : (
              <>
                <TextInput label="App ID" {...form.getInputProps("appId")} />
                <TextInput label="Installation ID" {...form.getInputProps("installationId")} />
                <Textarea label="Private key" autosize minRows={4} classNames={{ input: "fd-mono" }} {...form.getInputProps("privateKey")} />
              </>
            )}
            <Alert variant="light" color="gray">Secrets are encrypted before they're stored and never shown again. Saving for the same organisation and use replaces the old one.</Alert>
            <Button type="submit" loading={saving}>Save and check</Button>
          </Stack>
        </form>
      </Drawer>
    </>
  );
}
