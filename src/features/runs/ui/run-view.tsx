"use client";

import { Accordion, Alert, Anchor, Badge, Button, Grid, Group, Menu, Paper, Stack, Table, Text, Textarea, ThemeIcon, Title } from "@mantine/core";
import { IconBrandGithub, IconPlayerPlay, IconRefresh, IconShieldCheck, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RunView as Data } from "../server/queries";
import { runActionAction } from "../server/actions";
import { decideApprovalAction } from "@/features/approvals/server/actions";
import { formatDuration, shortSha } from "@/lib/format";
import { PageHeader } from "@/ui/page-header";
import { PhaseBadge, PhaseDot } from "@/ui/status";
import { StageMap } from "@/ui/stage-map";
import { TimeAgo } from "@/ui/time";
import { LiveRefresh } from "@/ui/live-refresh";
import { useServerAction } from "@/ui/use-server-action";

const span = (a: string | null, b: string | null) => (a ? (b ? Date.parse(b) : Date.now()) - Date.parse(a) : null);
const jobPhase = (status: string, conclusion: string | null) =>
  status === "completed" ? (conclusion === "success" ? "succeeded" : conclusion === "skipped" || conclusion === "cancelled" ? "cancelled" : "failed") : status === "in_progress" ? "in_progress" : status === "waiting" ? "waiting" : "queued";

function ApprovalCard({ gate }: { gate: Data["gates"][number] }) {
  const [comment, setComment] = useState("");
  const [decide, deciding] = useServerAction(decideApprovalAction, { success: (_d) => "Decision recorded. Sending it to GitHub." });
  return (
    <Paper p="lg" style={{ borderColor: "var(--mantine-color-yellow-5)", background: "var(--mantine-color-yellow-light)" }}>
      <Group align="flex-start" wrap="nowrap" gap="md">
        <ThemeIcon color="yellow" size={40} radius="md">
          <IconShieldCheck size={22} />
        </ThemeIcon>
        <Stack gap="sm" style={{ flex: 1 }}>
          <div>
            <Title order={4}>{gate.environment} is waiting for your approval</Title>
            <Text size="sm" c="dimmed">
              Requested <TimeAgo at={gate.createdAt} />. {gate.reason}
            </Text>
          </div>
          {gate.error && (
            <Alert color="red" variant="light">
              The last attempt didn't reach GitHub: {gate.error}
            </Alert>
          )}
          <Textarea placeholder="Comment for the audit log (optional)" value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={2} maxLength={800} />
          <Group>
            <Button loading={deciding} onClick={() => decide({ gateId: gate.id, decision: "approve", comment })}>
              Approve
            </Button>
            <Button variant="default" color="red" leftSection={<IconX size={16} />} disabled={deciding} onClick={() => decide({ gateId: gate.id, decision: "reject", comment })}>
              Reject
            </Button>
            <Text size="xs" c="dimmed">
              Recorded under your name. GitHub receives it from the approver account.
            </Text>
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
}

export function RunView({ data }: { data: Data }) {
  const router = useRouter();
  const [act, acting] = useServerAction(runActionAction, { success: "Sent to GitHub", onSuccess: () => router.refresh() });
  const run = data.run;
  const mine = data.gates.filter((g) => g.canApprove);
  const othersPending = data.gates.filter((g) => !g.canApprove && (g.state === "pending" || g.state === "deciding"));
  const decided = data.gates.filter((g) => ["approved", "rejected", "closed"].includes(g.state));
  const runAgain = `/workflows/${data.family.id}?ref=${encodeURIComponent(data.ref)}${data.savedInputName ? `&preset=${encodeURIComponent(data.savedInputName)}` : ""}#run`;

  return (
    <>
      <LiveRefresh topics={[`run:${data.id}`]} />
      <PageHeader
        crumbs={[{ label: "Runs", href: "/runs" }, { label: data.family.title, href: `/workflows/${data.family.id}` }, { label: run?.runNumber ? `#${run.runNumber}` : "New run" }]}
        title={
          <Group gap="sm">
            {data.family.title}
            <PhaseBadge phase={data.phase} size="lg" />
          </Group>
        }
        description={
          <>
            {data.requester ? `Started by ${data.requester.name}` : data.actorLogin ? `Started by @${data.actorLogin} on GitHub` : "Started on GitHub"} on <span className="fd-mono">{run?.headBranch ?? data.ref}</span>
            {run?.headSha ? <span className="fd-mono"> @ {shortSha(run.headSha)}</span> : null}
            {data.savedInputName ? ` with “${data.savedInputName}”` : ""}, <TimeAgo at={data.createdAt} />
            {run?.completedAt && run.startedAt ? `, took ${formatDuration(span(run.startedAt, run.completedAt))}` : ""}.
          </>
        }
        actions={
          <>
            {data.htmlUrl && (
              <Button component="a" href={data.htmlUrl} target="_blank" rel="noreferrer" variant="default" leftSection={<IconBrandGithub size={16} />}>
                GitHub
              </Button>
            )}
            {data.canRunAgain && (
              <Button component={Link} href={runAgain} variant="default" leftSection={<IconPlayerPlay size={16} />}>
                Run again
              </Button>
            )}
            {data.canRerun && (
              <Menu position="bottom-end">
                <Menu.Target>
                  <Button variant="default" leftSection={<IconRefresh size={16} />} loading={acting}>
                    Rerun
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => act({ runRequestId: data.id, action: "rerun" })}>All jobs</Menu.Item>
                  <Menu.Item onClick={() => act({ runRequestId: data.id, action: "rerun_failed" })}>Failed jobs only</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
            {data.canCancel && (
              <Button color="red" variant="light" loading={acting} onClick={() => act({ runRequestId: data.id, action: "cancel" })}>
                Cancel run
              </Button>
            )}
          </>
        }
      />

      <Stack gap="lg">
        {data.error && (
          <Alert color="red" variant="light" title={data.phase === "dispatch_failed" ? "GitHub didn't start this run" : "The last action failed"}>
            {data.error}
          </Alert>
        )}
        {data.phase === "unknown" && (
          <Alert color="blue" variant="light">
            GitHub didn't answer in time. FlowDeck is checking whether the run started before trying again, so it never starts twice.
          </Alert>
        )}

        <Paper p="lg">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Progress</Title>
            {run?.runAttempt && run.runAttempt > 1 && <Badge variant="default">Attempt {run.runAttempt}</Badge>}
          </Group>
          <StageMap meta={data.graphJobs} jobs={data.liveJobs} />
        </Paper>

        {mine.map((g) => (
          <ApprovalCard key={g.id} gate={g} />
        ))}
        {othersPending.map((g) => (
          <Alert key={g.id} color="yellow" variant="light" icon={<IconShieldCheck size={16} />} title={g.state === "deciding" ? `${g.decision === "approve" ? "Approved" : "Rejected"} by ${g.decidedBy ?? "someone"}, sending to GitHub` : `${g.environment} is waiting for approval`}>
            {g.state === "pending" ? `Reviewers: ${g.reviewers}. ${g.reason}` : null}
          </Alert>
        ))}

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Paper p="lg">
              <Title order={4} mb="sm">
                Jobs
              </Title>
              {data.jobs.length === 0 ? (
                <Text c="dimmed" size="sm">
                  No jobs yet.
                </Text>
              ) : (
                <Accordion variant="separated" multiple defaultValue={data.jobs.filter((j) => j.status === "in_progress" || j.conclusion === "failure").map((j) => j.id)}>
                  {data.jobs.map((j) => (
                    <Accordion.Item key={j.id} value={j.id}>
                      <Accordion.Control>
                        <Group justify="space-between" wrap="nowrap" pr="sm">
                          <Group gap="sm" wrap="nowrap">
                            <PhaseDot phase={jobPhase(j.status, j.conclusion)} label={j.name} />
                          </Group>
                          <Text size="sm" c="dimmed" suppressHydrationWarning>
                            {formatDuration(span(j.startedAt, j.completedAt))}
                          </Text>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap={4}>
                          {j.steps.map((s) => (
                            <Group key={s.number} justify="space-between">
                              <Text size="sm" c={s.conclusion === "failure" ? "red" : undefined}>
                                {s.name}
                              </Text>
                              <Text size="xs" c="dimmed" suppressHydrationWarning>
                                {formatDuration(span(s.startedAt, s.completedAt))}
                              </Text>
                            </Group>
                          ))}
                          {j.htmlUrl && (
                            <Anchor href={j.htmlUrl} target="_blank" rel="noreferrer" size="sm" mt="xs">
                              Open logs on GitHub
                            </Anchor>
                          )}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              )}
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="lg">
              <Paper p="lg">
                <Title order={4} mb="sm">
                  Inputs
                </Title>
                {Object.keys(data.inputs).length === 0 ? (
                  <Text c="dimmed" size="sm">
                    {data.source === "github" ? "Started on GitHub, so inputs aren't known." : "No inputs."}
                  </Text>
                ) : (
                  <Table withRowBorders={false} verticalSpacing={4}>
                    <Table.Tbody>
                      {Object.entries(data.inputs).map(([k, v]) => (
                        <Table.Tr key={k}>
                          <Table.Td c="dimmed" w="45%">
                            {data.inputLabels[k] ?? k}
                          </Table.Td>
                          <Table.Td className="fd-mono" style={{ wordBreak: "break-all" }}>
                            {v}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Paper>
              {decided.length > 0 && (
                <Paper p="lg">
                  <Title order={4} mb="sm">
                    Approvals
                  </Title>
                  <Stack gap="xs">
                    {decided.map((g) => (
                      <div key={g.id}>
                        <Text size="sm" fw={500}>
                          {g.environment}: {g.state === "closed" ? "settled on GitHub" : g.state}
                        </Text>
                        {g.decidedBy && (
                          <Text size="xs" c="dimmed">
                            by {g.decidedBy}, <TimeAgo at={g.decidedAt} />
                            {g.comment ? ` · “${g.comment}”` : ""}
                          </Text>
                        )}
                      </div>
                    ))}
                  </Stack>
                </Paper>
              )}
              <Text size="xs" c="dimmed" px="xs">
                {run?.lastSyncedAt ? <>Checked with GitHub <TimeAgo at={run.lastSyncedAt} />. </> : null}Updates arrive live; if one is missed, FlowDeck checks again within a minute.
              </Text>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </>
  );
}
