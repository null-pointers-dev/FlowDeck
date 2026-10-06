"use client";

import { Tabs } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { value: "/admin", label: "Overview", perm: "admin.audit" },
  { value: "/admin/connections", label: "Connections", perm: "admin.connections" },
  { value: "/admin/access", label: "Access", perm: "admin.access" },
  { value: "/admin/approvals", label: "Approval rules", perm: "admin.approvals" },
  { value: "/admin/audit", label: "Audit log", perm: "admin.audit" },
];

export function AdminTabs({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = TABS.filter((t) => allowed.includes(t.perm));
  const current = tabs.find((t) => t.value !== "/admin" && pathname.startsWith(t.value))?.value ?? "/admin";
  return (
    <Tabs value={current} onChange={(v) => v && router.push(v)} mb="xl">
      <Tabs.List>
        {tabs.map((t) => (
          <Tabs.Tab key={t.value} value={t.value}>
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
