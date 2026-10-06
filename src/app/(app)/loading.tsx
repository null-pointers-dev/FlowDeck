import { Skeleton, Stack } from "@mantine/core";

export default function Loading() {
  return (
    <Stack gap="md">
      <Skeleton height={32} width={280} />
      <Skeleton height={18} width={420} />
      <Skeleton height={160} mt="lg" />
      <Skeleton height={160} />
    </Stack>
  );
}
