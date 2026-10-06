"use client";

import { Alert, Badge, Button, Checkbox, Grid, Group, Modal, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { PERMISSIONS, PERMISSION_LABELS, type Permission } from "@/features/access/domain/permissions";
import { addBindingAction, addGroupAction, checkAccessAction, deleteRoleAction, groupImpactAction, removeBindingAction, saveRoleAction, syncGroupsAction } from "../server/actions";
import { useServerAction } from "@/ui/use-server-action";

type Role = { id: string; key: string; name: string; description: string | null; permissions: Permission[]; builtIn: boolean };
type Binding = { id: string; groupId: string; roleId: string; scopeCategory: string | null; scopeFamily: string | null; scopeEnvironment: string | null };
type Props = {
  roles: Role[];
  bindings: Binding[];
  groups: Array<{ id: string; displayName: string }>;
  people: Array<{ id: string; name: string; email: string }>;
  categories: Array<{ key: string; name: string }>;
  families: Array<{ id: string; title: string }>;
  environments: string[];
  graphConfigured: boolean;
};

function RoleModal({ role, opened, onClose }: { role: Role | null; opened: boolean; onClose: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [key, setKey] = useState(role?.key ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? ["catalog.view"]);
  const [save, saving] = useServerAction(saveRoleAction, { success: "Role saved", onSuccess: onClose });
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={650}>{role ? `Edit ${role.name}` : "New role"}</Text>} size="lg" centered>
      <Stack>
        <SimpleGrid cols={2}>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Release manager" />
          <TextInput label="Key" value={key} onChange={(e) => setKey(e.currentTarget.value)} disabled={!!role} classNames={{ input: "fd-mono" }} placeholder="release-manager" />
        </SimpleGrid>
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} autosize />
        <Checkbox.Group label="Permissions" value={perms} onChange={setPerms}>
          <Stack gap={6} mt={6}>
            {PERMISSIONS.map((p) => (
              <Checkbox key={p} value={p} label={PERMISSION_LABELS[p]} description={p} />
            ))}
          </Stack>
        </Checkbox.Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => save({ id: role?.id, key: key || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, description, permissions: perms as Permission[] })}>
            Save role
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function AccessView({ roles, bindings, groups, people, categories, families, environments, graphConfigured }: Props) {
  const groupName = (id: string) => groups.find((g) => g.id === id)?.displayName ?? id;
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "Deleted role";
  const [editing, setEditing] = useState<Role | null>(null);
  const [roleOpen, roleModal] = useDisclosure(false);

  const [binding, setBinding] = useState({ groupId: null as string | null, roleId: null as string | null, category: null as string | null, familyId: null as string | null, environment: null as string | null });
  const [impact, setImpact] = useState<number | null>(null);
  const [addBinding, adding] = useServerAction(addBindingAction, { success: "Binding added", onSuccess: () => setBinding({ groupId: null, roleId: null, category: null, familyId: null, environment: null }) });
  const [removeBinding] = useServerAction(removeBindingAction, { success: "Binding removed" });
  const [measure] = useServerAction(groupImpactAction, { onSuccess: (r) => setImpact(r.people) });
  const [deleteRole] = useServerAction(deleteRoleAction, { success: "Role deleted" });
  const [syncGroups, syncing] = useServerAction(syncGroupsAction, { success: "Refreshing groups from Entra" });
  const [newGroup, setNewGroup] = useState({ id: "", displayName: "" });
  const [addGroup, addingGroup] = useServerAction(addGroupAction, { success: "Group added", onSuccess: () => setNewGroup({ id: "", displayName: "" }) });

  const [check, setCheck] = useState({ userId: null as string | null, permission: "workflow.run" as Permission, category: null as string | null, familyId: null as string | null, environment: null as string | null });
  const [result, setResult] = useState<{ allowed: boolean; reasons: string[] } | null>(null);
  const [runCheck, checking] = useServerAction(checkAccessAction, { onSuccess: setResult });

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.displayName }));

  return (
    <Stack gap="xl">
      <Alert variant="light" color="gray">
        Entra decides who can sign in and which groups each person is in (groups assigned to the FlowDeck app). Here you decide what each group can do. Changes apply at each person's next sign-in, within 12 hours. People with the Entra role FlowDeck.Admin can always do everything.
      </Alert>

      <section>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Roles</Title>
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => { setEditing(null); roleModal.open(); }}>New role</Button>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {roles.map((r) => (
            <Paper key={r.id} p="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Group gap={6}>
                    <Text fw={600}>{r.name}</Text>
                    {r.builtIn && <Badge size="xs" variant="default">Built in</Badge>}
                  </Group>
                  <Text size="sm" c="dimmed">{r.description}</Text>
                </div>
                <Group gap={4}>
                  <Button size="xs" variant="subtle" onClick={() => { setEditing(r); roleModal.open(); }}>Edit</Button>
                  {!r.builtIn && (
                    <Button size="xs" variant="subtle" color="red" onClick={() => modals.openConfirmModal({ title: `Delete ${r.name}?`, children: <Text size="sm">Groups bound to it lose these permissions.</Text>, labels: { confirm: "Delete", cancel: "Cancel" }, confirmProps: { color: "red" }, onConfirm: () => deleteRole({ id: r.id }) })}>
                      Delete
                    </Button>
                  )}
                </Group>
              </Group>
              <Group gap={4} mt="sm">
                {r.permissions.map((p) => (
                  <Badge key={p} size="sm" variant="light" color="gray">{p}</Badge>
                ))}
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
      </section>

      <section>
        <Title order={4} mb="sm">Group bindings</Title>
        <Paper p="md" mb="md">
          <Grid align="flex-end">
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Select label="Entra group" searchable data={groupOptions} value={binding.groupId} onChange={(v) => { setBinding({ ...binding, groupId: v }); setImpact(null); if (v) measure({ groupId: v }); }} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 2 }}>
              <Select label="Role" data={roles.map((r) => ({ value: r.id, label: r.name }))} value={binding.roleId} onChange={(v) => setBinding({ ...binding, roleId: v })} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 2 }}>
              <Select label="Category" placeholder="Any" clearable data={categories.map((c) => ({ value: c.key, label: c.name }))} value={binding.category} onChange={(v) => setBinding({ ...binding, category: v })} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 2 }}>
              <Select label="Workflow" placeholder="Any" clearable searchable data={families.map((f) => ({ value: f.id, label: f.title }))} value={binding.familyId} onChange={(v) => setBinding({ ...binding, familyId: v })} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 2 }}>
              <Select label="Environment" placeholder="Any" clearable data={environments} value={binding.environment} onChange={(v) => setBinding({ ...binding, environment: v })} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 1 }}>
              <Button fullWidth loading={adding} disabled={!binding.groupId || !binding.roleId} onClick={() => addBinding({ groupId: binding.groupId!, roleId: binding.roleId!, category: binding.category, familyId: binding.familyId, environment: binding.environment })}>
                Add
              </Button>
            </Grid.Col>
          </Grid>
          {impact !== null && binding.groupId && (
            <Text size="xs" c="dimmed" mt="xs">
              {impact} {impact === 1 ? "person" : "people"} who signed in recently {impact === 1 ? "is" : "are"} in this group and will get this role at their next sign-in.
            </Text>
          )}
        </Paper>
        <Paper>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Group</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Applies to</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {bindings.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}><Text c="dimmed" size="sm" ta="center" py="md">No bindings yet. Until you add one, only FlowDeck.Admin users can do anything.</Text></Table.Td>
                </Table.Tr>
              )}
              {bindings.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td>{groupName(b.groupId)}</Table.Td>
                  <Table.Td>{roleName(b.roleId)}</Table.Td>
                  <Table.Td c="dimmed">{[b.scopeCategory && `category ${b.scopeCategory}`, b.scopeFamily && `workflow ${b.scopeFamily}`, b.scopeEnvironment && `environment ${b.scopeEnvironment}`].filter(Boolean).join(", ") || "Everything"}</Table.Td>
                  <Table.Td ta="right">
                    <Button size="xs" variant="subtle" color="red" onClick={() => removeBinding({ id: b.id })}>Remove</Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </section>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper p="md">
          <Group justify="space-between" mb="sm">
            <Title order={5}>Entra groups ({groups.length})</Title>
            <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} loading={syncing} disabled={!graphConfigured} onClick={() => syncGroups({})}>Refresh from Entra</Button>
          </Group>
          {!graphConfigured && <Text size="xs" c="dimmed" mb="sm">Set ENTRA_SERVICE_PRINCIPAL_ID and grant Application.Read.All to list groups automatically. Until then, add them by object ID.</Text>}
          <Group align="flex-end" gap="xs">
            <TextInput size="xs" label="Object ID" value={newGroup.id} onChange={(e) => setNewGroup({ ...newGroup, id: e.currentTarget.value })} classNames={{ input: "fd-mono" }} style={{ flex: 1 }} />
            <TextInput size="xs" label="Name" value={newGroup.displayName} onChange={(e) => setNewGroup({ ...newGroup, displayName: e.currentTarget.value })} style={{ flex: 1 }} />
            <Button size="xs" loading={addingGroup} disabled={!newGroup.id || !newGroup.displayName} onClick={() => addGroup(newGroup)}>Add</Button>
          </Group>
        </Paper>

        <Paper p="md">
          <Title order={5} mb="sm">Check access</Title>
          <Stack gap="xs">
            <Select size="xs" label="Person" searchable data={people.map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }))} value={check.userId} onChange={(v) => setCheck({ ...check, userId: v })} />
            <Group grow gap="xs">
              <Select size="xs" label="Permission" data={PERMISSIONS.map((p) => ({ value: p, label: p }))} value={check.permission} onChange={(v) => v && setCheck({ ...check, permission: v as Permission })} />
              <Select size="xs" label="Workflow" clearable searchable data={families.map((f) => ({ value: f.id, label: f.title }))} value={check.familyId} onChange={(v) => setCheck({ ...check, familyId: v })} />
              <Select size="xs" label="Environment" clearable data={environments} value={check.environment} onChange={(v) => setCheck({ ...check, environment: v })} />
            </Group>
            <Button size="xs" variant="default" loading={checking} disabled={!check.userId} onClick={() => runCheck({ userId: check.userId!, permission: check.permission, category: check.category, familyId: check.familyId, environment: check.environment })}>
              Check
            </Button>
            {result && (
              <Alert color={result.allowed ? "teal" : "red"} variant="light" title={result.allowed ? "Allowed" : "Not allowed"}>
                {result.reasons.map((r) => <Text key={r} size="sm">{r}</Text>)}
              </Alert>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      {roleOpen && <RoleModal key={editing?.id ?? "new"} role={editing} opened={roleOpen} onClose={roleModal.close} />}
    </Stack>
  );
}
