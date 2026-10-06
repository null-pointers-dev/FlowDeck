"use client";

import { Alert, Button, Checkbox, Divider, Group, Menu, Modal, NumberInput, Paper, PasswordInput, SegmentedControl, Select, Stack, Switch, Table, TableTbody, TableTd, TableTr, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle, IconDeviceFloppy, IconDots, IconPlayerPlay, IconShieldCheck, IconStar, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { WorkflowPageData } from "../server/queries";
import { startRunAction } from "@/features/runs/server/actions";
import { deleteSavedInputAction, saveInputsAction, toggleDefaultSavedInputAction } from "@/features/personal/server/actions";
import { defaultValues, isVisible, toFormValues, validateInputs, type InputField, type InputValues } from "@/features/runs/domain/inputs";
import { buildGraph, resolveEnvironment } from "@/features/runs/domain/graph";
import { useServerAction } from "@/ui/use-server-action";

type Props = { data: WorkflowPageData; initialRef: string | null; initialPreset: string | null };

const LAST_RUN = "__last__";
const EMPTY = "__empty__";

export function RunPanel({ data, initialRef, initialPreset }: Props) {
  const router = useRouter();
  const version = data.version!;
  const envNames = data.environments.map((e) => e.name);
  const fields: InputField[] = useMemo(
    () => version.inputs.map((f) => (f.type === "environment" && !f.options?.length ? { ...f, options: envNames } : f)),
    [version.inputs, envNames],
  );

  const startPreset = data.savedInputs.find((s) => s.name === initialPreset) ?? data.savedInputs.find((s) => s.isDefault) ?? null;
  const load = (source: string): { values: InputValues; ref: string; stale: string[] } => {
    if (source === LAST_RUN && data.lastMine) return { ...toFormValues(fields, data.lastMine.inputs), ref: data.lastMine.ref };
    const s = data.savedInputs.find((x) => x.name === source);
    if (s) return { ...toFormValues(fields, s.inputs), ref: s.ref ?? data.repo.defaultBranch };
    return { values: {}, ref: data.repo.defaultBranch, stale: [] };
  };
  const initial = startPreset ? load(startPreset.name) : { values: {}, ref: data.repo.defaultBranch, stale: [] };

  const [source, setSource] = useState<string>(startPreset?.name ?? EMPTY);
  const [stale, setStale] = useState<string[]>(initial.stale);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm<{ ref: string; values: InputValues }>({
    initialValues: { ref: initialRef ?? initial.ref, values: { ...defaultValues(fields), ...initial.values } },
    validate: (v) => {
      const { errors } = validateInputs(fields, v.values);
      return Object.fromEntries(Object.entries(errors).map(([k, m]) => [`values.${k}`, m]));
    },
  });
  const values = form.getValues().values;

  const applySource = (s: string) => {
    setSource(s);
    const next = s === EMPTY ? { values: {}, ref: data.repo.defaultBranch, stale: [] } : load(s);
    setStale(next.stale);
    form.setValues({ ref: next.ref, values: { ...defaultValues(fields), ...next.values } });
  };

  // What will happen: stages, and which environments will wait for approval.
  const serialized = validateInputs(fields, values).serialized;
  const envByName = new Map(data.environments.map((e) => [e.name.toLowerCase(), e]));
  const targeted = [...new Set(version.jobs.map((j) => resolveEnvironment(j.environment, serialized)).filter((e): e is string => !!e))];
  const gated = targeted.map((e) => envByName.get(e.toLowerCase())).filter((e): e is NonNullable<typeof e> => !!e?.protected);
  const blocked = targeted.filter((e) => envByName.get(e.toLowerCase()) && !envByName.get(e.toLowerCase())!.canRun);
  const stages = buildGraph(version.jobs, []).sort((a, b) => a.level - b.level);

  const [review, reviewModal] = useDisclosure(false);
  const [saveOpen, saveModal] = useDisclosure(false);
  const [saveName, setSaveName] = useState("");
  const [saveDefault, setSaveDefault] = useState(false);

  const [start, starting] = useServerAction(startRunAction, {
    onSuccess: (r) => router.push(`/runs/${r.id}`),
    onError: (e) => {
      reviewModal.close();
      if (e.fieldErrors) form.setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [`values.${k}`, m])));
    },
  });
  const [save, saving] = useServerAction(saveInputsAction, {
    success: (r) => `Saved as “${r.name}”`,
    onSuccess: (r) => {
      saveModal.close();
      setSource(r.name);
      router.refresh();
    },
  });
  const [remove] = useServerAction(deleteSavedInputAction, { success: "Saved inputs deleted", onSuccess: () => router.refresh() });
  const [toggleDefault] = useServerAction(toggleDefaultSavedInputAction, { onSuccess: () => router.refresh() });

  const currentSaved = data.savedInputs.find((s) => s.name === source);
  const sourceOptions = [
    { value: EMPTY, label: "Defaults" },
    ...(data.lastMine ? [{ value: LAST_RUN, label: "My last run" }] : []),
    ...data.savedInputs.map((s) => ({ value: s.name, label: s.isDefault ? `${s.name} (default)` : s.name })),
  ];

  const submitPayload = () => {
    const visible: InputValues = {};
    for (const f of fields) if (isVisible(f, values) && values[f.key] !== undefined) visible[f.key] = values[f.key];
    return { familyId: data.family.id, version: version.version, ref: form.getValues().ref, inputs: visible as Record<string, string | number | boolean>, idempotencyKey, savedInputName: currentSaved?.name ?? null };
  };

  return (
    <Paper p="lg" id="run">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={4}>Run</Title>
          <Group gap={4}>
            <Select size="xs" w={170} data={sourceOptions} value={source} onChange={(v) => v && applySource(v)} aria-label="Start from" allowDeselect={false} />
            <Menu position="bottom-end">
              <Menu.Target>
                <Button size="xs" variant="subtle" px={6} aria-label="Saved input options">
                  <IconDots size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconDeviceFloppy size={16} />} onClick={() => { setSaveName(currentSaved?.name ?? ""); setSaveDefault(currentSaved?.isDefault ?? false); saveModal.open(); }}>
                  Save inputs as…
                </Menu.Item>
                {currentSaved && (
                  <>
                    <Menu.Item leftSection={<IconStar size={16} />} onClick={() => toggleDefault({ id: currentSaved.id })}>
                      {currentSaved.isDefault ? "Stop using as default" : "Use as my default"}
                    </Menu.Item>
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => remove({ id: currentSaved.id })}>
                      Delete “{currentSaved.name}”
                    </Menu.Item>
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {stale.length > 0 && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
            The workflow changed since these inputs were saved. Not used any more: {stale.join(", ")}. Check the fields below.
          </Alert>
        )}

        <TextInput label="Branch or tag" classNames={{ input: "fd-mono" }} {...form.getInputProps("ref")} description={form.getValues().ref === data.repo.defaultBranch ? undefined : "Inputs are checked against the workflow file on this ref before it starts."} />

        {fields.filter((f) => isVisible(f, values)).map((f) => {
          const props = form.getInputProps(`values.${f.key}`);
          const description = f.help ?? f.description;
          const label = f.label;
          if (f.type === "boolean") return <Switch key={f.key} label={label} description={description} {...form.getInputProps(`values.${f.key}`, { type: "checkbox" })} />;
          if (f.type === "number") return <NumberInput key={f.key} label={label} description={description} withAsterisk={f.required} min={f.min} max={f.max} {...props} />;
          if (f.type === "choice" || f.type === "environment") {
            const isEnv = f.type === "environment" || envByName.has(String(f.options?.[0] ?? "").toLowerCase());
            const options = (f.options ?? []).map((o) => {
              const env = isEnv ? envByName.get(o.toLowerCase()) : undefined;
              return { value: o, label: env?.protected ? `${o} · needs approval` : o, disabled: env ? !env.canRun : false };
            });
            if (options.length <= 4 && options.every((o) => o.label.length < 28)) {
              return (
                <Stack key={f.key} gap={4}>
                  <Text size="sm" fw={500}>
                    {label}
                    {f.required && <Text span c="red"> *</Text>}
                  </Text>
                  <SegmentedControl fullWidth data={options.map((o) => ({ value: o.value, label: o.value, disabled: o.disabled }))} {...props} value={String(props.value ?? "")} />
                  {props.error ? <Text size="xs" c="red">{props.error}</Text> : description ? <Text size="xs" c="dimmed">{description}</Text> : null}
                </Stack>
              );
            }
            return <Select key={f.key} label={label} description={description} withAsterisk={f.required} data={options} clearable={!f.required} searchable {...props} />;
          }
          return f.sensitive ? (
            <PasswordInput key={f.key} label={label} description={description} withAsterisk={f.required} {...props} />
          ) : (
            <TextInput key={f.key} label={label} description={description} withAsterisk={f.required} classNames={f.pattern ? { input: "fd-mono" } : undefined} {...props} />
          );
        })}

        {gated.length > 0 && (
          <Alert color="yellow" variant="light" icon={<IconShieldCheck size={16} />}>
            {gated.map((g) => g.name).join(", ")} {gated.length === 1 ? "needs" : "need"} approval before those jobs start. {gated[0].approvers}.
          </Alert>
        )}
        {blocked.length > 0 && (
          <Alert color="red" variant="light">
            Your roles don't allow running in {blocked.join(", ")}.
          </Alert>
        )}
        {data.activeRuns > 0 && version.concurrency && (
          <Text size="xs" c="dimmed">
            {data.activeRuns} run{data.activeRuns === 1 ? " is" : "s are"} active. This workflow {version.concurrency.cancelInProgress ? "cancels the earlier run" : "queues behind the earlier run"} in the same concurrency group.
          </Text>
        )}

        <Button
          size="md"
          leftSection={<IconPlayerPlay size={18} />}
          disabled={blocked.length > 0}
          onClick={() => {
            if (!form.validate().hasErrors) reviewModal.open();
          }}
        >
          Review and run
        </Button>
      </Stack>

      <Modal opened={review} onClose={reviewModal.close} title={<Text fw={650}>Run {data.family.title}?</Text>} size="lg" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Version {version.version} on <span className="fd-mono">{form.getValues().ref}</span>. It will be recorded under your name.
          </Text>
          <div>
            <Text size="sm" fw={600} mb={6}>
              What happens
            </Text>
            <Stack gap={4}>
              {stages.map((s, i) => {
                const env = version.jobs.find((j) => j.id === s.key)?.environment;
                const resolved = resolveEnvironment(env, serialized);
                const needs = resolved && envByName.get(resolved.toLowerCase())?.protected;
                return (
                  <Group key={s.key} gap="xs">
                    <Text size="sm" c="dimmed" w={20}>
                      {i + 1}.
                    </Text>
                    <Text size="sm">{s.label}</Text>
                    {needs && (
                      <Text size="xs" c="yellow.8">
                        waits for approval in {resolved}
                      </Text>
                    )}
                  </Group>
                );
              })}
            </Stack>
          </div>
          <Divider />
          <Table withRowBorders={false} verticalSpacing={4}>
            <TableTbody>
              {fields.filter((f) => isVisible(f, values) && !f.hidden).map((f) => (
                <TableTr key={f.key}>
                  <TableTd c="dimmed" w="40%">
                    {f.label}
                  </TableTd>
                  <TableTd className="fd-mono">{f.sensitive ? "••••••" : String(serialized[f.key] ?? "—")}</TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
          <Group justify="flex-end">
            <Button variant="default" onClick={reviewModal.close}>
              Back
            </Button>
            <Button loading={starting} leftSection={<IconPlayerPlay size={16} />} onClick={() => start(submitPayload())}>
              Run workflow
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={saveOpen} onClose={saveModal.close} title={<Text fw={650}>Save these inputs</Text>} centered>
        <Stack>
          <TextInput label="Name" description="Short and memorable, like prod-canary" value={saveName} onChange={(e) => setSaveName(e.currentTarget.value)} data-autofocus />
          <Checkbox label="Use as my default for this workflow" checked={saveDefault} onChange={(e) => setSaveDefault(e.currentTarget.checked)} />
          <Text size="xs" c="dimmed">
            Saves the branch and every field. Only you can see it.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={saveModal.close}>
              Cancel
            </Button>
            <Tooltip label="Give it a name" disabled={!!saveName.trim()}>
              <Button loading={saving} disabled={!saveName.trim()} onClick={() => save({ familyId: data.family.id, name: saveName, ref: form.getValues().ref, inputs: submitPayload().inputs, isDefault: saveDefault })}>
                Save
              </Button>
            </Tooltip>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
