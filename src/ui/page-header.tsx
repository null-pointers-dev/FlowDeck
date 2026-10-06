"use client";

import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
}) {
  return (
    <Stack gap={6} mb="xl">
      {crumbs && (
        <Breadcrumbs separatorMargin={6}>
          {crumbs.map((c) =>
            c.href ? (
              <Anchor key={c.label} component={Link} href={c.href} size="sm" c="dimmed">
                {c.label}
              </Anchor>
            ) : (
              <Text key={c.label} size="sm" c="dimmed">
                {c.label}
              </Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Title order={2}>{title}</Title>
          {description && (
            <Text c="dimmed" maw={720}>
              {description}
            </Text>
          )}
        </Stack>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
    </Stack>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Stack align="center" gap="xs" py={48} px="md" ta="center">
      <Text fw={600}>{title}</Text>
      {children && (
        <Text c="dimmed" size="sm" maw={460}>
          {children}
        </Text>
      )}
      {action}
    </Stack>
  );
}
