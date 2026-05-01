import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const STATE_FULL_NAME_PATTERNS = ["adjective", "form_of"] as const;

export type StateFullNamePattern = (typeof STATE_FULL_NAME_PATTERNS)[number];

const PATTERN_LOOKUP = new Map<string, StateFullNamePattern>();
for (const p of STATE_FULL_NAME_PATTERNS)
  PATTERN_LOOKUP.set(p.toLowerCase(), p);

export function resolveStateFullNamePattern(
  value: unknown,
): StateFullNamePattern | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return PATTERN_LOOKUP.get(key) ?? null;
}

export interface StateFullNameRef {
  i: number;
  name: string;
  /** state.formName (the specific form, not the parent category). */
  form: string;
  fullName: string | null;
  removed: boolean;
}

export interface RegenerateStateFullNameRuntime {
  find(ref: number | string): StateFullNameRef | null;
  /** Returns null when window.getAdjective is unavailable. */
  getAdjective(noun: string): string | null;
  apply(i: number, fullName: string): void;
}

export const defaultRegenerateStateFullNameRuntime: RegenerateStateFullNameRuntime =
  {
    find(ref) {
      const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
      if (!entry) return null;
      return {
        i: entry.i,
        name: entry.name ?? "",
        // Use formName (the specific form shown in the state-editor's
        // form-select) — the legacy editor's regenerateFullName reads
        // stateNameEditorSelectForm.value, which is initialised from
        // s.formName and written back to s.formName on save.
        form: entry.formName ?? "",
        fullName: entry.fullName ?? null,
        removed: !!entry.removed,
      };
    },
    getAdjective(noun) {
      const fn = getGlobal<(n: string) => string>("getAdjective");
      if (typeof fn !== "function") return null;
      return fn(noun);
    },
    apply(i, fullName) {
      const states = getPackCollection<RawState>("states");
      const state = states?.[i];
      if (!state) throw new Error(`State ${i} not found.`);
      state.fullName = fullName;
      try {
        getGlobal<(ids: number[]) => void>("drawStateLabels")?.([i]);
      } catch {
        // Best-effort.
      }
    },
  };

type PatternUsed = StateFullNamePattern | "short_only" | "the_form";

export function createRegenerateStateFullNameTool(
  runtime: RegenerateStateFullNameRuntime = defaultRegenerateStateFullNameRuntime,
): Tool {
  return {
    name: "regenerate_state_full_name",
    description:
      "Derive a fresh ceremonial fullName for a single state from its short name (state.name) and specific form (state.formName) — same side-effect as the State editor's full-name 'Regenerate' button. pattern='adjective' (default) builds 'Adjective Form' (e.g. 'Valorian Republic'); pattern='form_of' builds 'Form of Short' (e.g. 'Republic of Valoria'). When only the short name is set the result is just the short name; when only the form is set the result is 'The {Form}'. Writes state.fullName and best-effort calls drawStateLabels([i]) to refresh the label. Rejects state 0 (Neutrals).",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or case-insensitive name / fullName. Rejects Neutrals (0).",
        },
        pattern: {
          type: "string",
          enum: [...STATE_FULL_NAME_PATTERNS],
          default: "adjective",
          description:
            "Combination pattern: 'adjective' = Adjective Form (e.g. 'Valorian Republic'); 'form_of' = Form of Short (e.g. 'Republic of Valoria'). Ignored when short name or form is missing.",
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        pattern?: unknown;
      };

      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);

      let pattern: StateFullNamePattern = "adjective";
      if (input.pattern !== undefined && input.pattern !== null) {
        const resolved = resolveStateFullNamePattern(input.pattern);
        if (!resolved) {
          return errorResult("pattern must be 'adjective' or 'form_of'.");
        }
        pattern = resolved;
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(`State ${refResult.ref} not found.`);
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot regenerate full name for state 0 (the Neutrals placeholder).",
        );
      }
      if (current.removed) {
        return errorResult(
          `Cannot regenerate full name for removed state ${current.i}.`,
        );
      }

      const short = current.name.trim();
      const form = current.form.trim();

      if (!short && !form) {
        return errorResult("State has neither short name nor form.");
      }

      let newFullName: string;
      let patternUsed: PatternUsed;

      if (!form) {
        newFullName = short;
        patternUsed = "short_only";
      } else if (!short) {
        newFullName = `The ${form}`;
        patternUsed = "the_form";
      } else if (pattern === "form_of") {
        newFullName = `${form} of ${short}`;
        patternUsed = "form_of";
      } else {
        const adj = runtime.getAdjective(short);
        if (typeof adj !== "string" || !adj.trim()) {
          return errorResult(
            "window.getAdjective is not available; the map hasn't finished loading.",
          );
        }
        newFullName = `${adj} ${form}`;
        patternUsed = "adjective";
      }

      const previousFullName = current.fullName;

      try {
        runtime.apply(current.i, newFullName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        state: { i: current.i, name: current.name },
        previous_full_name: previousFullName,
        full_name: newFullName,
        pattern_used: patternUsed,
      });
    },
  };
}

export const regenerateStateFullNameTool = createRegenerateStateFullNameTool();
