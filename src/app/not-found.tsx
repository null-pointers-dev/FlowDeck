import { Button, Center, Stack, Text, Title } from "@mantine/core";

export default function NotFound() {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm">
        <Title order={3}>Not found</Title>
        <Text c="dimmed">It may have been removed, or you may not have access to it.</Text>
        <Button component="a" href="/" variant="default">
          Back to Home
        </Button>
      </Stack>
    </Center>
  );
}
