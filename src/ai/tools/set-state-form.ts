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

export const FORM_CATEGORIES = [
  "Monarchy",
  "Republic",
  "Union",
  "Theocracy",
  "Anarchy",
] as const;

export type FormCategory = (typeof FORM_CATEGORIES)[number];

export interface CanonicalForm {
  formName: string;
  category: FormCategory;
}

// Mirrors the #stateNameEditorSelectForm options in src/index.html:4506-4582.
export const FORMS_BY_CATEGORY: Record<FormCategory, string[]> = {
  Monarchy: [
    "Beylik",
    "Despotate",
    "Dominion",
    "Duchy",
    "Emirate",
    "Empire",
    "Horde",
    "Grand Duchy",
    "Heptarchy",
    "Khaganate",
    "Khanate",
    "Kingdom",
    "Marches",
    "Principality",
    "Satrapy",
    "Shogunate",
    "Sultanate",
    "Tsardom",
    "Ulus",
    "Viceroyalty",
  ],
  Republic: [
    "Chancellery",
    "City-state",
    "Diarchy",
    "Federation",
    "Free City",
    "Most Serene Republic",
    "Oligarchy",
    "Protectorate",
    "Republic",
    "Tetrarchy",
    "Trade Company",
    "Triumvirate",
  ],
  Union: [
    "Confederacy",
    "Confederation",
    "Conglomerate",
    "Commonwealth",
    "League",
    "Union",
    "United Hordes",
    "United Kingdom",
    "United Provinces",
    "United Republic",
    "United States",
    "United Tribes",
  ],
  Theocracy: [
    "Bishopric",
    "Brotherhood",
    "Caliphate",
    "Diocese",
    "Divine Duchy",
    "Divine Grand Duchy",
    "Divine Principality",
    "Divine Kingdom",
    "Divine Empire",
    "Eparchy",
    "Exarchate",
    "Holy State",
    "Imamah",
    "Patriarchate",
    "Theocracy",
  ],
  Anarchy: ["Commune", "Community", "Council", "Free Territory", "Tribes"],
};

const LOOKUP = new Map<string, CanonicalForm>();
for (const category of FORM_CATEGORIES) {
  for (const formName of FORMS_BY_CATEGORY[category]) {
    LOOKUP.set(formName.toLowerCase(), { formName, category });
  }
}

export function resolveFormName(value: unknown): CanonicalForm | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export function allCanonicalFormNames(): string[] {
  return FORM_CATEGORIES.flatMap((c) => FORMS_BY_CATEGORY[c]);
}

export interface StateFormRef {
  i: number;
  name: string;
  previousForm: string | null;
  previousFormName: string | null;
}

export interface StateFormRuntime {
  find(ref: number | string): StateFormRef | null;
  apply(i: number, form: CanonicalForm): void;
}

export const defaultStateFormRuntime: StateFormRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousForm: entry.form ?? null,
      previousFormName: entry.formName ?? null,
    };
  },
  apply(i: number, form: CanonicalForm): void {
    const states = getPackCollection<RawState>("states");
    const s = states?.[i];
    if (!s) throw new Error(`State ${i} not found.`);
    if (s.removed) throw new Error(`State ${i} has been removed.`);
    s.form = form.category;
    s.formName = form.formName;
    const draw = getGlobal<(ids: number[]) => void>("drawStateLabels");
    if (typeof draw === "function") draw([i]);
  },
};

export function createSetStateFormTool(
  runtime: StateFormRuntime = defaultStateFormRuntime,
): Tool {
  return {
    name: "set_state_form",
    description: `Change a state's government form (e.g. Kingdom, Empire, Republic, Theocracy). Sets both the specific formName and the parent form category (one of: ${FORM_CATEGORIES.join(", ")}). Refreshes the state label if the renderer is available. Supported formNames match the States Editor dropdown.`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description: "Numeric state id (> 0) or current name.",
        },
        formName: {
          type: "string",
          description:
            "Specific form name (e.g. 'Kingdom', 'Empire', 'Republic', 'Theocracy'). Case-insensitive. Must match the States Editor dropdown.",
        },
      },
      required: ["state", "formName"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        formName?: unknown;
      };

      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.formName !== "string" || !input.formName.trim()) {
        return errorResult("formName must be a non-empty string.");
      }

      const resolved = resolveFormName(input.formName);
      if (!resolved) {
        return errorResult(
          `Unknown form name: ${JSON.stringify(input.formName)}.`,
          { supported: allCanonicalFormNames() },
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot change form on state 0 (the Neutrals placeholder).",
        );
      }

      try {
        runtime.apply(current.i, resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousForm: current.previousForm,
        previousFormName: current.previousFormName,
        form: resolved.category,
        formName: resolved.formName,
      });
    },
  };
}

export const setStateFormTool = createSetStateFormTool();
