"use client";

import { Alert, Anchor, Badge, Button, Code, Group, Modal, Paper, Stack, Text, Textarea, Title } from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import Link from "next/link";
import { useState } from "react";
import type { InboxItem } from "../server/queries";
import { decideApprovalAction } from "../server/actions";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { TimeAgo } from "@/ui/time";
import { LiveRefresh } from "@/ui/live-refresh";
import { useServerAction } from "@/ui/use-server-action";

type Decision = { id: string; environment: string; decision: "approve" | "reject" | null; state: string; decidedAt: string | null; runRequestId: string; title: string };

export function ApprovalsView({ items, decisions, needsGithubLink }: { items: InboxItem[]; decisions: Decision[]; needsGithubLink: boolean }) {
  const [selected, setSelected] = useState(0);
  const [rejecting, rejectModal] = useDisclosure(false);
  const [comment, setComment] = useState("");
  const [decide, deciding] = useServerAction(decideApprovalAction, {
    success: "Decision recorded. Sending it to GitHub.",
    onSuccess: () => {
      rejectModal.close();
      setComment("");
    },
  });
  const current = items[selected];
  useHotkeys([
    ["a", () => current && !deciding && decide({ gateId: current.id, decision: "approve" })],
    ["r", () => current && rejectModal.open()],
    ["j", () => setSelected((s) => Math.min(s + 1, items.length - 1))],
    ["k", () => setSelected((s) => Math.max(s - 1, 0))],
  ]);

  return (
    <>
      <LiveRefresh topics={["approvals"]} />
      <PageHeader
        title="Approvals"
        description={items.length ? `${items.length} ${items.length === 1 ? "deployment is" : "deployments are"} waiting for you. Oldest first.` : "Nothing is waiting for you."}
      />
      {needsGithubLink && (
        <Alert color="yellow" variant="light" mb="lg">
          Some environments follow GitHub's reviewers, and FlowDeck matches you by GitHub username. <Anchor component={Link} href="/account">Link your GitHub account</Anchor> to approve them.
        </Alert>
      )}
      {items.length === 0 ? (
        <Paper>
          <EmptyState title="You're all caught up">Deployments you're allowed to approve appear here. Requests for other approvers never do.</EmptyState>
        </Paper>
      ) : (
        <Stack gap="sm">
          {items.map((a, i) => (
            <Paper key={a.id} p="lg" onClick={() => setSelected(i)} style={{ borderColor: i === selected ? "var(--mantine-color-yellow-5)" : undefined, cursor: "pointer" }}>
              <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                <Stack gap={6} style={{ flex: 1, minWidth: 260 }}>
                  <Anchor component={Link} href={`/runs/${a.runRequestId}`} fw={600} c="var(--mantine-color-text)">
                    {a.title} to {a.environment}
                  </Anchor>
                  <Text size="sm" c="dimmed">
                    {a.requester ? `Started by ${a.requester}` : "Started on GitHub"} on <span className="fd-mono">{a.ref}</span>
                    {a.runNumber ? ` · run #${a.runNumber}` : ""}
                  </Text>
                  {Object.keys(a.inputs).length > 0 && (
                    <Group gap={6}>
                      {Object.entries(a.inputs).slice(0, 6).map(([k, v]) => (
                        <Code key={k}>
                          {k}: {v}
                        </Code>
                      ))}
                    </Group>
                  )}
                  {a.error && (
                    <Text size="sm" c="red">
                      Last attempt failed: {a.error}
                    </Text>
                  )}
                </Stack>
                <Stack gap="xs" align="flex-end">
                  <Badge color="yellow" variant="light">
                    Waiting <TimeAgo at={a.createdAt} />
                  </Badge>
                  <Group gap="xs">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(i);
                        rejectModal.open();
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      loading={deciding && selected === i}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(i);
                        decide({ gateId: a.id, decision: "approve" });
                      }}
                    >
                      Approve
                    </Button>
                  </Group>
                </Stack>
              </Group>
            </Paper>
          ))}
          <Text size="xs" c="dimmed">
            Keyboard: J and K to move, A to approve, R to reject.
          </Text>
        </Stack>
      )}

      {decisions.length > 0 && (
        <Paper p="lg" mt="xl">
          <Title order={4} mb="sm">
            Your recent decisions
          </Title>
          <Stack gap="xs">
            {decisions.map((d) => (
              <Group key={d.id} justify="space-between">
                <Anchor component={Link} href={`/runs/${d.runRequestId}`} size="sm" c="var(--mantine-color-text)">
                  {d.title} to {d.environment}
                </Anchor>
                <Group gap="xs">
                  <Badge color={d.decision === "approve" ? "teal" : "red"} variant="light">
                    {d.decision === "approve" ? "Approved" : "Rejected"}
                    {d.state === "deciding" ? ", sending" : ""}
                  </Badge>
                  <TimeAgo at={d.decidedAt} size="xs" c="dimmed" />
                </Group>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}

      <Modal opened={rejecting} onClose={rejectModal.close} title={<Text fw={650}>Reject {current?.title} to {current?.environment}?</Text>} centered>
        <Stack>
          <Textarea label="Reason" description="Shown on GitHub and in the audit log" value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={3} data-autofocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={rejectModal.close}>
              Cancel
            </Button>
            <Button color="red" loading={deciding} onClick={() => current && decide({ gateId: current.id, decision: "reject", comment })}>
              Reject
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
