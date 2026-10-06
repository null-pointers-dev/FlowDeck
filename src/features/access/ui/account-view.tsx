"use client";

import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import { authClient } from "@/lib/auth-client";
import { PageHeader } from "@/ui/page-header";

type Props = {
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  githubLogin: string | null;
  githubEnabled: boolean;
  grants: Array<{ role: string; group: string; scope: string }>;
};

export function AccountView({ name, email, isPlatformAdmin, githubLogin, githubEnabled, grants }: Props) {
  return (
    <>
      <PageHeader title={name} description={email} />
      <Stack gap="lg" maw={860}>
        <Paper p="lg">
          <Title order={4} mb="xs">
            Your access
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            Access comes from your Entra groups. FlowDeck admins decide what each group can do.
          </Text>
          {isPlatformAdmin && (
            <Badge color="brand" mb="md">
              Platform admin (Entra role FlowDeck.Admin)
            </Badge>
          )}
          {grants.length === 0 && !isPlatformAdmin ? (
            <Text size="sm">None of your groups has a role in FlowDeck yet.</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Through group</Table.Th>
                  <Table.Th>Applies to</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {grants.map((g, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{g.role}</Table.Td>
                    <Table.Td>{g.group}</Table.Td>
                    <Table.Td c="dimmed">{g.scope}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
        <Paper p="lg">
          <Title order={4} mb="xs">
            GitHub account
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            Linking is optional. It lets FlowDeck match you to GitHub's environment reviewers.
          </Text>
          <Group>
            {githubLogin ? <Badge variant="default" leftSection={<IconBrandGithub size={12} />}>@{githubLogin}</Badge> : <Text size="sm">Not linked</Text>}
            {githubEnabled && (
              <Button variant="default" leftSection={<IconBrandGithub size={16} />} onClick={() => authClient.linkSocial({ provider: "github", callbackURL: "/account" })}>
                {githubLogin ? "Re-link" : "Link GitHub"}
              </Button>
            )}
          </Group>
        </Paper>
      </Stack>
    </>
  );
}
