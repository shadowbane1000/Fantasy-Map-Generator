import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { composeProvinceFullName } from "./regenerate-province-name";

export interface SetProvinceFormRef {
  i: number;
  name: string;
  previousForm: string | null;
  previousFullName: string | null;
}

export interface SetProvinceFormRuntime {
  find(ref: number | string): SetProvinceFormRef | null;
  apply(i: number, formName: string, fullName: string): void;
}

export const defaultSetProvinceFormRuntime: SetProvinceFormRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawProvince>("provinces"),
      ref,
    );
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.removed) return null;
    if (entry.lock) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousForm: entry.formName ?? null,
      previousFullName: entry.fullName ?? null,
    };
  },
  apply(i: number, formName: string, fullName: string): void {
    const provinces = getPackCollection<RawProvince>("provinces");
    const province = provinces?.[i];
    if (!province) throw new Error(`Province ${i} not found.`);
    province.formName = formName;
    province.fullName = fullName;
    if (typeof document === "undefined") return;
    const label = document.getElementById(`provinceLabel${i}`);
    if (label && typeof province.name === "string") {
      label.textContent = province.name;
    }
  },
};

export function createSetProvinceFormTool(
  runtime: SetProvinceFormRuntime = defaultSetProvinceFormRuntime,
): Tool {
  return {
    name: "set_province_form",
    description:
      "Change a province's form (the Provinces Editor's form-name dropdown #provinceNameEditorSelectForm — Barony, County, Duchy, Principality, Territory, …). Free-form string: the UI dropdown lists ~36 defaults but the editor's '+ custom form' plus-icon lets users type anything, so this tool accepts any non-empty string. Writes `province.formName` AND recomputes `province.fullName` as `\"{name} {form}\"` (or `\"The {form}\"` when the short name is empty — same composition as regenerate_province_name / the editor's Regenerate Full Name button). Best-effort refreshes the `#provinceLabel{i}` SVG (redundant here but parallels rename_province). Refuses province 0 (placeholder), removed provinces, and locked provinces. Unlike states, provinces have no form category — there is only `formName`. Parallels `set_state_form` for the state-level equivalent.",
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or case-insensitive name / fullName.",
        },
        form: {
          type: "string",
          description:
            "The new form name (e.g. 'Duchy', 'Barony', 'County', 'Principality'). Free-form — any non-empty string after trim() is accepted, mirroring the editor's custom-form input.",
        },
      },
      required: ["province", "form"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        form?: unknown;
      };

      const refResult = parseEntityRef(input.province, "province");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.form !== "string" || !input.form.trim()) {
        return errorResult("form must be a non-empty string.");
      }
      const trimmedForm = input.form.trim();

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const newFullName = composeProvinceFullName(current.name, trimmedForm);

      try {
        runtime.apply(current.i, trimmedForm, newFullName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousForm: current.previousForm,
        form: trimmedForm,
        previousFullName: current.previousFullName,
        fullName: newFullName,
      });
    },
  };
}

export const setProvinceFormTool = createSetProvinceFormTool();
