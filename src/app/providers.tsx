"use client";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { theme } from "./theme";

/** The theme holds functions, so the provider lives in a client file. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" limit={4} />
      <ModalsProvider>{children}</ModalsProvider>
    </MantineProvider>
  );
}
