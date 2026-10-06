"use client";

import { Alert, Badge, Button, Checkbox, Grid, MultiSelect, Paper, SegmentedControl, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { addRuleAction, deleteRuleAction } from "../server/actions";
import { useServerAction } from "@/ui/use-server-action";

type Rule = { id: string; familyId: string | null; environmentName: string; mode: "github" | "flowdeck"; approverGroupIds: string[]; preventSelfApproval: boolean };
type Props = {
  rules: Rule[];
  groups: Array<{ id: string; displayName: string }>;
  families: Array<{ id: string; title: string }>;
  environments: string[];
  approverOwners: string[];
  owners: string[];
};

export function RulesView({ rules, groups, families, environments, approverOwners, owners }: Props) {
  const [draft, setDraft] = useState({ familyId: null as string | null, environmentName: "", mode: "flowdeck" as "github" | "flowdeck", approverGroupIds: [] as string[], preventSelfApproval: true });
  const [add, adding] = useServerAction(addRuleAction, { success: "Rule added", onSuccess: () => setDraft({ ...draft, familyId: null, environmentName: "", approverGroupIds: [] }) });
  const [remove] = useServerAction(deleteRuleAction, { success: "Rule removed" });
  const groupName = (id: string) => groups.find((g) => g.id === id)?.displayName ?? id;
  const familyName = (id: string | null) => (id ? families.find((f) => f.id === id)?.title ?? id : "Any workflow");
  const missing = owners.filter((o) => !approverOwners.includes(o));

  return (
    <Stack gap="xl">
      <Alert variant="light" color="gray">
        Decisions always reach GitHub through the approver token, and FlowDeck records who approved. These rules decide which people may press Approve. Requests only appear for those people. The most specific rule wins: workflow and environment, then workflow, then environment, then the default.
      </Alert>
      {missing.length > 0 && <Alert color="yellow" variant="light">No approver token for {missing.join(", ")}. Approving there fails until one is added under Connections.</Alert>}

      <Paper>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Workflow</Table.Th>
              <Table.Th>Environment</Table.Th>
              <Table.Th>Who can approve</Table.Th>
              <Table.Th>Self-approval</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rules.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{familyName(r.familyId)}</Table.Td>
                <Table.Td className="fd-mono">{r.environmentName === "*" ? "Any" : r.environmentName}</Table.Td>
                <Table.Td>{r.mode === "github" ? <Badge variant="light">GitHub reviewers</Badge> : r.approverGroupIds.map((g) => <Badge key={g} variant="default" mr={4}>{groupName(g)}</Badge>)}</Table.Td>
                <Table.Td c="dimmed">{r.preventSelfApproval ? "Not allowed" : "Allowed"}</Table.Td>
                <Table.Td ta="right">
                  {!(r.familyId === null && r.environmentName === "*" && rules.filter((x) => !x.familyId && x.environmentName === "*").length === 1) && (
                    <Button size="xs" variant="subtle" color="red" onClick={() => remove({ id: r.id })}>Remove</Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper p="lg">
        <Title order={5} mb="md">Add a rule</Title>
        <Grid align="flex-end">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select label="Workflow" placeholder="Any workflow" clearable searchable data={families.map((f) => ({ value: f.id, label: f.title }))} value={draft.familyId} onChange={(v) => setDraft({ ...draft, familyId: v })} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <TextInput label="Environment" placeholder="production, or * for any" value={draft.environmentName} onChange={(e) => setDraft({ ...draft, environmentName: e.currentTarget.value })} list="fd-envs" classNames={{ input: "fd-mono" }} />
            <datalist id="fd-envs">{environments.map((e) => <option key={e} value={e} />)}</datalist>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Text size="sm" fw={500} mb={4}>Who can approve</Text>
            <SegmentedControl fullWidth value={draft.mode} onChange={(v) => setDraft({ ...draft, mode: v as "github" | "flowdeck" })} data={[{ value: "flowdeck", label: "FlowDeck approver groups" }, { value: "github", label: "Mirror GitHub reviewers" }]} />
          </Grid.Col>
          {draft.mode === "flowdeck" && (
            <Grid.Col span={12}>
              <MultiSelect label="Approver groups" searchable data={groups.map((g) => ({ value: g.id, label: g.displayName }))} value={draft.approverGroupIds} onChange={(v) => setDraft({ ...draft, approverGroupIds: v })} description="Members also need a role with approval.decide." />
            </Grid.Col>
          )}
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Checkbox label="People can't approve runs they started" checked={draft.preventSelfApproval} onChange={(e) => setDraft({ ...draft, preventSelfApproval: e.currentTarget.checked })} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Button fullWidth loading={adding} onClick={() => add({ ...draft, environmentName: draft.environmentName || "*" })}>Add rule</Button>
          </Grid.Col>
        </Grid>
      </Paper>
    </Stack>
  );
}
