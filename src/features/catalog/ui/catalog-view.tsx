"use client";

import { Anchor, Badge, Card, Chip, Grid, Group, Paper, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { SearchHit } from "@/features/search/server/search";
import { EmptyState, PageHeader } from "@/ui/page-header";

type Props = {
  hits: SearchHit[];
  categories: Array<{ key: string; name: string; parent: string | null }>;
  environments: string[];
  query: string;
};

/** Search state lives in the URL: shareable, back-button friendly, rendered on the server. */
export function CatalogView({ hits, categories, environments, query }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const onType = useDebouncedCallback((v: string) => setParam("q", v.trim() || null), 250);

  return (
    <>
      <PageHeader title="Workflows" description="Every workflow you can run, with its documentation. Search by name or describe what you need." />
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="lg" pos="sticky" top={84}>
            <TextInput
              leftSection={<IconSearch size={16} />}
              placeholder="Search"
              value={text}
              onChange={(e) => {
                setText(e.currentTarget.value);
                onType(e.currentTarget.value);
              }}
              aria-label="Search workflows"
            />
            <Select
              label="Category"
              placeholder="All categories"
              clearable
              searchable
              value={params.get("category")}
              onChange={(v) => setParam("category", v)}
              data={categories.map((c) => ({ value: c.key, label: c.parent ? `${c.parent} / ${c.name}` : c.name }))}
            />
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Environment
              </Text>
              <Chip.Group value={params.get("env") ?? ""} onChange={(v) => setParam("env", (v as string) || null)}>
                <Group gap={6}>
                  {environments.map((e) => (
                    <Chip key={e} value={e} size="xs" variant="outline">
                      {e}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </Stack>
            <Select
              label="Scope"
              placeholder="Any"
              clearable
              value={params.get("scope")}
              onChange={(v) => setParam("scope", v)}
              data={[
                { value: "generic", label: "Generic (any team)" },
                { value: "specific", label: "Team-specific" },
              ]}
            />
            <Switch label="Include reusable and internal workflows" checked={params.get("all") === "1"} onChange={(e) => setParam("all", e.currentTarget.checked ? "1" : null)} />
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 9 }}>
          <Text size="sm" c="dimmed" mb="sm">
            {pending ? "Searching…" : query ? `${hits.length} results for “${query}”` : `${hits.length} workflows, the ones you use most first`}
          </Text>
          {hits.length === 0 ? (
            <Paper>
              <EmptyState title="No workflows match">Try fewer words, a different category, or describe the task (for example “restart pods in staging”).</EmptyState>
            </Paper>
          ) : (
            <Stack gap="sm" style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}>
              {hits.map((h) => (
                <Card key={h.id} padding="md" component={Link} href={`/workflows/${h.id}`} style={{ textDecoration: "none" }}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Group gap={8} wrap="nowrap">
                        <Text fw={600} truncate>
                          {h.title}
                        </Text>
                        {h.currentVersion && h.currentVersion !== "latest" && (
                          <Badge size="sm" variant="default">
                            {h.currentVersion}
                          </Badge>
                        )}
                        {h.status !== "active" && (
                          <Badge size="sm" color="orange">
                            {h.status}
                          </Badge>
                        )}
                        {!h.hasDoc && (
                          <Badge size="sm" color="gray">
                            Doc in progress
                          </Badge>
                        )}
                      </Group>
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {h.summary || "No summary yet."}
                      </Text>
                      {h.snippet && (
                        <Text size="xs" c="dimmed" lineClamp={2} fs="italic">
                          Matched in {h.snippet.section}: {h.snippet.text}
                        </Text>
                      )}
                    </Stack>
                    <Stack gap={6} align="flex-end">
                      {h.category && <Badge variant="light">{h.category}</Badge>}
                      {h.myRuns > 0 && (
                        <Text size="xs" c="dimmed">
                          You ran it {h.myRuns}×
                        </Text>
                      )}
                    </Stack>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
          <Text size="xs" c="dimmed" mt="md">
            Tip: type <Anchor component="span" className="fd-mono">env:production</Anchor> or <Anchor component="span" className="fd-mono">cat:deploy</Anchor> to filter as you search.
          </Text>
        </Grid.Col>
      </Grid>
    </>
  );
}
