import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ReligionFormRef {
  i: number;
  name: string;
  previousForm: string | null;
}

export interface ReligionFormRuntime {
  find(ref: number | string): ReligionFormRef | null;
  apply(i: number, form: string): void;
}

export const defaultReligionFormRuntime: ReligionFormRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousForm: entry.form ?? null,
    };
  },
  apply(i: number, form: string): void {
    const religions = getPackCollection<RawReligion>("religions");
    const religion = religions?.[i];
    if (!religion) throw new Error(`Religion ${i} not found.`);
    if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
    religion.form = form;
  },
};

export function createSetReligionFormTool(
  runtime: ReligionFormRuntime = defaultReligionFormRuntime,
): Tool {
  return {
    name: "set_religion_form",
    description:
      "Set a religion's form — the free-form narrative descriptor from the Religions Editor (e.g. Druidism, Shamanism, Church of Light, Heterodoxy). Writes religion.form. Matches by id (>0) or case-insensitive current name. The 'No religion' placeholder (id 0) is rejected.",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        form: {
          type: "string",
          description:
            "Free-form narrative descriptor (e.g. Druidism, Shamanism, Church of Light).",
        },
      },
      required: ["religion", "form"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        form?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.form !== "string" || !input.form.trim()) {
        return errorResult("form must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set form on religion 0 (the 'No religion' placeholder).",
        );
      }

      const form = input.form.trim();
      try {
        runtime.apply(current.i, form);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousForm: current.previousForm,
        form,
      });
    },
  };
}

export const setReligionFormTool = createSetReligionFormTool();
