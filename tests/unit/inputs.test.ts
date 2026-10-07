import { describe, expect, it } from "vitest";
import { defaultValues, toFormValues, validateInputs, type InputField } from "@/features/runs/domain/inputs";

const fields: InputField[] = [
  { key: "environment", type: "choice", label: "Environment", required: true, options: ["staging", "production"] },
  { key: "version", type: "string", label: "Version", required: true, pattern: "^\\d+\\.\\d+\\.\\d+$", patternMessage: "Use a full version like 2.14.0." },
  { key: "canary", type: "boolean", label: "Canary", required: false, default: false },
  { key: "canary_percent", type: "number", label: "Canary traffic", required: false, min: 1, max: 50, visibleWhen: { input: "canary", equals: "true" } },
];

describe("validateInputs", () => {
  it("initializes optional non-boolean inputs with controlled empty values", () => {
    expect(defaultValues([
      { key: "text", type: "string", label: "Text", required: false },
      { key: "count", type: "number", label: "Count", required: false },
    ])).toEqual({ text: "", count: "" });
  });

  it("applies patterns with a friendly message", () => {
    expect(validateInputs(fields, { ...defaultValues(fields), version: "2.14" }).errors.version).toBe("Use a full version like 2.14.0.");
  });
  it("checks ranges only when the field is visible", () => {
    expect(validateInputs(fields, { environment: "production", version: "2.14.0", canary: true, canary_percent: 80 }).errors.canary_percent).toBeTruthy();
    const ok = validateInputs(fields, { environment: "production", version: "2.14.0", canary: false, canary_percent: 80 });
    expect(ok.ok).toBe(true);
    expect(ok.serialized).toEqual({ environment: "production", version: "2.14.0", canary: "false" });
  });
  it("rejects unknown inputs and invalid choices", () => {
    const r = validateInputs(fields, { environment: "prod", version: "1.0.0", extra: "x" });
    expect(r.errors.environment).toBeTruthy();
    expect(r.errors.extra).toBeTruthy();
  });
  it("restores saved values and reports stale keys", () => {
    const r = toFormValues(fields, { environment: "staging", canary: "true", canary_percent: "10", removed: "x" });
    expect(r.values).toEqual({ environment: "staging", canary: true, canary_percent: 10 });
    expect(r.stale).toEqual(["removed"]);
  });
});
