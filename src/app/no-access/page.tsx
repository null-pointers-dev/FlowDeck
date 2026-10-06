import { Button, Center, Paper, Stack, Text, Title } from "@mantine/core";

export const metadata = { title: "No access" };

/** Server component using Mantine with plain props only (no handlers, no Component.Sub). */
export default async function NoAccess({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <Center mih="100vh" p="md">
      <Paper p={40} maw={480}>
        <Stack>
          <Title order={3}>{reason === "permission" ? "You don't have access to that page" : "You don't have access to FlowDeck yet"}</Title>
          <Text c="dimmed">
            {reason === "permission"
              ? "Your roles don't include this area. If you need it, ask a FlowDeck admin to bind your team's Entra group to a role that does."
              : "FlowDeck access comes from your team's Entra group. Ask your manager or the platform team to add your group to the FlowDeck application in Entra, then sign in again."}
          </Text>
          <Button component="a" href={reason === "permission" ? "/" : "/sign-in"} variant="default" w="fit-content">
            {reason === "permission" ? "Back to Home" : "Sign in again"}
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
