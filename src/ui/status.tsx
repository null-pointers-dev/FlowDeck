"use client";

import { Badge, Group, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconClock, IconLoader2, IconPlayerPause, IconX } from "@tabler/icons-react";
import { phaseLabel, phaseTone } from "@/features/runs/domain/phases";

const COLOR = { ok: "teal", fail: "red", run: "blue", wait: "yellow", idle: "gray" } as const;
const ICON = { ok: IconCheck, fail: IconX, run: IconLoader2, wait: IconPlayerPause, idle: IconClock } as const;

export function PhaseBadge({ phase, size = "md" }: { phase: string; size?: "sm" | "md" | "lg" }) {
  const tone = phaseTone(phase);
  const Icon = ICON[tone];
  return (
    <Badge color={COLOR[tone]} size={size} leftSection={<Icon size={12} stroke={2.5} />}>
      {phaseLabel(phase)}
    </Badge>
  );
}

export function PhaseDot({ phase, label }: { phase: string; label?: string }) {
  const tone = phaseTone(phase);
  const Icon = ICON[tone];
  return (
    <Group gap={6} wrap="nowrap">
      <ThemeIcon size={18} radius="xl" variant="light" color={COLOR[tone]}>
        <Icon size={11} stroke={2.5} />
      </ThemeIcon>
      <Text size="sm">{label ?? phaseLabel(phase)}</Text>
    </Group>
  );
}
