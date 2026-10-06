"use client";

import { Badge, Group, Kbd, Text, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Spotlight, spotlight } from "@mantine/spotlight";
import { IconArrowRight, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Hit = { id: string; title: string; summary: string; category: string | null; version: string | null; status: string };

/** ⌘K / Ctrl+K from anywhere. Calls the GET search route so typing stays fast and cancellable. */
export function SearchSpotlight() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 150);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((h: Hit[]) => setHits(h))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debounced]);

  const go = (path: string) => {
    spotlight.close();
    router.push(path);
  };

  return (
    <>
      <UnstyledButton onClick={spotlight.open} aria-label="Search workflows" w={{ base: 40, sm: 420 }}>
        <Group gap="sm" px="sm" h={36} style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-md)", background: "var(--mantine-color-default)" }} wrap="nowrap">
          <IconSearch size={16} color="var(--mantine-color-dimmed)" />
          <Text size="sm" c="dimmed" flex={1} visibleFrom="sm">
            Search workflows, or describe what you need
          </Text>
          <Kbd size="xs" visibleFrom="sm">
            ⌘ K
          </Kbd>
        </Group>
      </UnstyledButton>

      <Spotlight.Root query={query} onQueryChange={setQuery} shortcut={["mod + K", "/"]} scrollable maxHeight={480}>
        <Spotlight.Search placeholder="Restart pods, deploy to AKS, rotate a secret…" leftSection={<IconSearch size={18} />} />
        <Spotlight.ActionsList>
          {hits.map((h) => (
            <Spotlight.Action key={h.id} onClick={() => go(`/workflows/${h.id}`)}>
              <Group wrap="nowrap" w="100%" gap="sm">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text fw={600} size="sm" truncate>
                      {h.title}
                    </Text>
                    {h.status === "deprecated" && (
                      <Badge size="xs" color="orange">
                        Deprecated
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {h.summary || h.id}
                  </Text>
                </div>
                {h.category && (
                  <Badge size="sm" variant="default">
                    {h.category}
                  </Badge>
                )}
              </Group>
            </Spotlight.Action>
          ))}
          {!loading && hits.length === 0 && <Spotlight.Empty>No workflows match. Try other words, or browse the catalog.</Spotlight.Empty>}
          {query.trim() && (
            <Spotlight.Action onClick={() => go(`/workflows?q=${encodeURIComponent(query)}`)}>
              <Group gap="xs">
                <IconArrowRight size={16} />
                <Text size="sm">See all results for “{query}”</Text>
              </Group>
            </Spotlight.Action>
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
}
