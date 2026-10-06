"use client";

import { Alert, Button, Center, Divider, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconBrandWindows } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Logo } from "@/ui/logo";

export function SignInView({ entra, devLogin, next }: { entra: boolean; devLogin: boolean; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({ initialValues: { email: "", password: "", name: "" } });

  const devSubmit = form.onSubmit(async (v) => {
    setBusy(true);
    setError(null);
    let res = await authClient.signIn.email({ email: v.email, password: v.password });
    if (res.error && v.name) res = (await authClient.signUp.email({ email: v.email, password: v.password, name: v.name })) as typeof res;
    setBusy(false);
    if (res.error) return setError(res.error.message ?? "That didn't work.");
    router.push(next);
    router.refresh();
  });

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-default-hover)">
      <Paper p={40} w={420} shadow="sm">
        <Stack gap="lg">
          <Logo size={36} />
          <Stack gap={4}>
            <Title order={2}>Sign in to FlowDeck</Title>
            <Text c="dimmed">Find, run and approve the DevOps workflows your team relies on.</Text>
          </Stack>
          {entra ? (
            <Button
              size="md"
              leftSection={<IconBrandWindows size={18} />}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await authClient.signIn.social({ provider: "microsoft", callbackURL: next });
              }}
            >
              Continue with Microsoft
            </Button>
          ) : (
            <Alert color="yellow" variant="light">
              Microsoft sign-in isn't configured. Set the ENTRA_* variables.
            </Alert>
          )}
          {devLogin && (
            <>
              <Divider label="Local development" labelPosition="center" />
              <form onSubmit={devSubmit}>
                <Stack gap="sm">
                  <TextInput label="Email" type="email" required {...form.getInputProps("email")} />
                  <PasswordInput label="Password" required minLength={8} {...form.getInputProps("password")} />
                  <TextInput label="Name" description="Only needed the first time" {...form.getInputProps("name")} />
                  {error && <Text c="red" size="sm">{error}</Text>}
                  <Button type="submit" variant="default" loading={busy}>
                    Sign in
                  </Button>
                </Stack>
              </form>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
