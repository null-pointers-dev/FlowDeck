"use client";

import { ActionIcon, AppShell, Avatar, Badge, Burger, Divider, Group, Indicator, Menu, NavLink, ScrollArea, Stack, Text, Tooltip, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { IconBell, IconHome, IconLayoutList, IconLogout, IconMoonStars, IconPlayerPlay, IconSettings, IconShieldCheck, IconSun, IconUser } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { markAllReadAction } from "@/features/notify/server/actions";
import { Logo } from "./logo";
import { SearchSpotlight } from "./search-spotlight";
import { TimeAgo } from "./time";
import { useServerAction } from "./use-server-action";

export type ShellProps = {
  user: { name: string; email: string };
  approvals: number;
  showAdmin: boolean;
  notifications: { unread: number; items: Array<{ id: string; title: string; body: string | null; link: string | null; read: boolean; at: string }> };
  children: React.ReactNode;
};

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function Shell({ user, approvals, showAdmin, notifications, children }: ShellProps) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const router = useRouter();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const [mounted, setMounted] = useState(false);
  const [markRead] = useServerAction(markAllReadAction, { onSuccess: () => router.refresh() });

  useEffect(() => setMounted(true), []);

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const nav = [
    { href: "/", label: "Home", icon: IconHome },
    { href: "/workflows", label: "Workflows", icon: IconLayoutList },
    { href: "/runs", label: "Runs", icon: IconPlayerPlay },
    { href: "/approvals", label: "Approvals", icon: IconShieldCheck, badge: approvals },
    ...(showAdmin ? [{ href: "/admin", label: "Admin", icon: IconSettings }] : []),
  ];

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 232, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="xl">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu" />
            <UnstyledButton component={Link} href="/">
              <Group gap={8} wrap="nowrap">
                <Logo />
                <Text fw={700} size="lg" visibleFrom="xs">
                  FlowDeck
                </Text>
              </Group>
            </UnstyledButton>
          </Group>

          <SearchSpotlight />

          <Group gap="xs" wrap="nowrap">
            <Menu width={360} position="bottom-end" onOpen={() => notifications.unread > 0 && markRead({})}>
              <Menu.Target>
                <Indicator disabled={notifications.unread === 0} label={notifications.unread} size={16} offset={4}>
                  <ActionIcon variant="subtle" size="lg" aria-label="Notifications">
                    <IconBell size={20} />
                  </ActionIcon>
                </Indicator>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Notifications</Menu.Label>
                {notifications.items.length === 0 && (
                  <Text size="sm" c="dimmed" p="sm">
                    Nothing yet.
                  </Text>
                )}
                {notifications.items.map((n) => (
                  <Menu.Item key={n.id} onClick={() => n.link && router.push(n.link)}>
                    <Stack gap={2}>
                      <Text size="sm" fw={n.read ? 400 : 600} lineClamp={2}>
                        {n.title}
                      </Text>
                      {n.body && <Text size="xs" c="dimmed" lineClamp={2}>{n.body}</Text>}
                      <TimeAgo at={n.at} size="xs" c="dimmed" />
                    </Stack>
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>

            <Tooltip label={mounted && computedColorScheme === "dark" ? "Light theme" : "Dark theme"}>
              <ActionIcon variant="subtle" size="lg" aria-label="Toggle theme" onClick={() => setColorScheme(computedColorScheme === "dark" ? "light" : "dark")}>
                {mounted && computedColorScheme === "dark" ? <IconSun size={19} /> : <IconMoonStars size={19} />}
              </ActionIcon>
            </Tooltip>

            <Menu position="bottom-end" width={240}>
              <Menu.Target>
                <UnstyledButton aria-label="Account">
                  <Avatar color="brand" radius="xl" size={34}>
                    {initials(user.name)}
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="sm" fw={600} c="var(--mantine-color-text)">
                    {user.name}
                  </Text>
                  <Text size="xs">{user.email}</Text>
                </Menu.Label>
                <Menu.Item leftSection={<IconUser size={16} />} component={Link} href="/account">
                  Account and access
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  onClick={async () => {
                    await authClient.signOut();
                    router.push("/sign-in");
                  }}
                >
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={2}>
            {nav.map((item) => (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                label={item.label}
                leftSection={<item.icon size={18} stroke={1.7} />}
                rightSection={item.badge ? <Badge size="sm" color="yellow" variant="filled" circle>{item.badge}</Badge> : null}
                active={active(item.href)}
                onClick={close}
                style={{ borderRadius: "var(--mantine-radius-md)" }}
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Divider mb="sm" />
          <Text size="xs" c="dimmed" px="xs">
            Press ⌘K anywhere to search.
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1280, margin: "0 auto" }} className="fd-fade" key={pathname}>
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
