"use client";

import { Alert, Anchor, Badge, Button, Grid, Group, Paper, Popover, Select, Stack, Table, Tabs, Text, TextInput } from "@mantine/core";
import { IconPin } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WorkflowPageData } from "../server/queries";
import { pinAction } from "@/features/personal/server/actions";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/ui/page-header";
import { PhaseDot } from "@/ui/status";
import { TimeAgo } from "@/ui/time";
import { useServerAction } from "@/ui/use-server-action";
import { RunPanel } from "./run-panel";

function PinButton({ data }: { data: WorkflowPageData }) {
  const [ref, setRef] = useState(data.repo.defaultBranch);
  const [preset, setPreset] = useState<string | null>(data.savedInputs.find((s) => s.isDefault)?.name ?? null);
  const [opened, setOpened] = useState(false);
  const [pin, pinning] = useServerAction(pinAction, { success: "Pinned to your dashboard", onSuccess: () => setOpened(false) });
  return (
    <Popover opened={opened} onChange={setOpened} width={300} position="bottom-end" shadow="md" trapFocus>
      <Popover.Target>
        <Button variant="default" leftSection={<IconPin size={16} />} onClick={() => setOpened((o) => !o)}>
          Pin to dashboard
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <TextInput label="Branch to watch" value={ref} onChange={(e) => setRef(e.currentTarget.value)} classNames={{ input: "fd-mono" }} />
          <Select
            label="Run with saved inputs"
            placeholder="None"
            clearable
            data={data.savedInputs.map((s) => s.name)}
            value={preset}
            onChange={setPreset}
            description={data.savedInputs.length ? undefined : "Save inputs from the run panel to use them here."}
          />
          <Button loading={pinning} onClick={() => pin({ familyId: data.family.id, ref: ref.trim() || data.repo.defaultBranch, savedInputName: preset })}>
            Pin
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export function WorkflowView({ data, initialRef, initialPreset }: { data: WorkflowPageData; initialRef: string | null; initialPreset: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { family, version } = data;
  const current = data.versions.find((v) => v.status === "current");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Workflows", href: "/workflows" }, ...(family.category ? [{ label: family.category, href: `/workflows?category=${encodeURIComponent(family.category)}` }] : []), { label: family.title }]}
        title={family.title}
        description={family.summary || undefined}
        actions={<PinButton data={data} />}
      />

      <Group gap="xs" mb="lg">
        {data.versions.length > 1 ? (
          <Select
            size="xs"
            w={200}
            aria-label="Version"
            value={version?.version ?? null}
            allowDeselect={false}
            data={data.versions.map((v) => ({ value: v.version, label: `${v.version}${v.status === "current" ? " (current)" : ` (${v.status})`}` }))}
            onChange={(v) => {
              const next = new URLSearchParams(params.toString());
              if (v) next.set("version", v);
              router.replace(`${pathname}?${next.toString()}`);
            }}
          />
        ) : (
          version && <Badge variant="default">{version.version}</Badge>
        )}
        {family.status !== "active" && <Badge color="orange">{family.status}</Badge>}
        <Badge variant="light" color="gray">
          {family.scope === "generic" ? "Generic" : "Team-specific"}
        </Badge>
        {family.owner && <Badge variant="light" color="gray">Owner: {family.owner}</Badge>}
        {family.typicalDuration && <Badge variant="light" color="gray">Usually {family.typicalDuration}</Badge>}
      </Group>

      {version && version.status !== "current" && current && (
        <Alert color="orange" variant="light" mb="lg">
          You're looking at {version.version}, which is {version.status}. The current version is{" "}
          <Anchor component={Link} href={`${pathname}?version=${current.version}`}>
            {current.version}
          </Anchor>
          .
        </Alert>
      )}

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Tabs defaultValue="overview" keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              <Tabs.Tab value="inputs">Inputs</Tabs.Tab>
              <Tabs.Tab value="runs">Recent runs</Tabs.Tab>
              {data.versions.length > 1 && <Tabs.Tab value="versions">Versions</Tabs.Tab>}
            </Tabs.List>

            <Tabs.Panel value="overview">
              {family.docBody ? (
                <div className="fd-doc">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{family.docBody}</ReactMarkdown>
                </div>
              ) : (
                <Alert variant="light" color="gray" title="Documentation in progress">
                  This workflow has no doc yet. The inputs below are read from its YAML. The DevOps team adds docs under docs/workflows in the repository.
                </Alert>
              )}
              {family.lastReviewed && (
                <Text size="xs" c="dimmed" mt="lg">
                  Last reviewed {family.lastReviewed}
                </Text>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="inputs">
              {!version?.inputs.length ? (
                <Text c="dimmed">This workflow takes no inputs.</Text>
              ) : (
                <Table.ScrollContainer minWidth={560}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Input</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Default</Table.Th>
                        <Table.Th>Meaning</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {version.inputs.filter((f) => !f.hidden).map((f) => (
                        <Table.Tr key={f.key}>
                          <Table.Td>
                            <Text fw={500} size="sm">
                              {f.label}
                            </Text>
                            <Text size="xs" c="dimmed" className="fd-mono">
                              {f.key}
                              {f.required ? " · required" : ""}
                            </Text>
                          </Table.Td>
                          <Table.Td>{f.type === "choice" ? (f.options ?? []).join(", ") : f.type}</Table.Td>
                          <Table.Td className="fd-mono">{f.default === undefined ? "—" : String(f.default)}</Table.Td>
                          <Table.Td>{f.help ?? f.description ?? "—"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="runs">
              {data.recent.length === 0 ? (
                <Text c="dimmed">No runs yet.</Text>
              ) : (
                <Table>
                  <Table.Tbody>
                    {data.recent.map((r) => (
                      <Table.Tr key={r.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/runs/${r.id}`)}>
                        <Table.Td>
                          <PhaseDot phase={r.phase} />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{r.requester ?? (r.actorLogin ? `@${r.actorLogin}` : "Started on GitHub")}</Text>
                          <Text size="xs" c="dimmed">
                            <span className="fd-mono">{r.ref}</span>
                            {r.savedInputName ? ` · ${r.savedInputName}` : ""}
                          </Text>
                        </Table.Td>
                        <Table.Td c="dimmed">{r.durationSeconds ? formatDuration(r.durationSeconds * 1000) : ""}</Table.Td>
                        <Table.Td ta="right">
                          <TimeAgo at={r.createdAt} size="sm" c="dimmed" />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="versions">
              <Stack gap="xs">
                {data.versions.map((v) => (
                  <Paper key={v.version} p="sm">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Anchor component={Link} href={`${pathname}?version=${v.version}`} fw={600}>
                          {v.version}
                        </Anchor>
                        <Badge color={v.status === "current" ? "teal" : v.status === "deprecated" ? "orange" : "gray"}>{v.status}</Badge>
                        {v.supersededBy && <Text size="xs" c="dimmed">replaced by {v.supersededBy}</Text>}
                      </Group>
                      <Text size="xs" c="dimmed" className="fd-mono">
                        {v.filePath}
                      </Text>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 5 }}>
          <div style={{ position: "sticky", top: 84 }}>
            {!version ? (
              <Alert color="gray">No workflow file was found for this entry.</Alert>
            ) : version.parseError ? (
              <Alert color="red" title="FlowDeck couldn't read this workflow">
                {version.parseError}
              </Alert>
            ) : !version.dispatchable ? (
              <Alert color="gray" title="Not runnable from FlowDeck">
                {family.kind === "reusable" ? "This is a reusable building block, called by other workflows." : "This workflow has no workflow_dispatch trigger."}
              </Alert>
            ) : !version.githubWorkflowId ? (
              <Alert color="orange" title="Workflow not found on GitHub">
                Check that this file exists on the repository's default branch, then sync the catalog again.
              </Alert>
            ) : version.githubState && version.githubState !== "active" ? (
              <Alert color="orange" title="Disabled on GitHub">
                Enable it on GitHub to run it here.
              </Alert>
            ) : !data.canRun ? (
              <Alert color="gray" title="You can read this workflow but not run it">
                Running it needs a role with permission to start runs for {family.category ?? "this workflow"}. Ask a FlowDeck admin.
              </Alert>
            ) : (
              <RunPanel data={data} initialRef={initialRef} initialPreset={initialPreset} />
            )}
          </div>
        </Grid.Col>
      </Grid>
    </>
  );
}
