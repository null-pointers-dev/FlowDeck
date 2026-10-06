"use client";

import { Button, Paper, Stack, Text, Title } from "@mantine/core";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Paper p="xl" maw={560}>
      <Stack>
        <Title order={3}>This page couldn't load</Title>
        <Text c="dimmed">Something went wrong on our side. Try again; if it keeps happening, share this reference with the platform team.</Text>
        {error.digest && <Text className="fd-mono">Reference: {error.digest}</Text>}
        <Button onClick={reset} w="fit-content">
          Try again
        </Button>
      </Stack>
    </Paper>
  );
}
