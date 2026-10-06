"use client";

import { Text, Tooltip, type TextProps } from "@mantine/core";
import { timeAgo } from "@/lib/format";

/** Relative time that never causes a hydration warning; exact time on hover. */
export function TimeAgo({ at, ...props }: { at: string | null | undefined } & TextProps) {
  if (!at) return null;
  return (
    <Tooltip label={new Date(at).toLocaleString()}>
      <Text span suppressHydrationWarning {...props}>
        {timeAgo(at)}
      </Text>
    </Tooltip>
  );
}
