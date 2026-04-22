import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ProvinceRef {
  i: number;
  name: string;
  formName: string | null;
  fullName: string | null;
}

export interface ProvinceRenameUpdates {
  name: string;
  formName?: string;
  fullName?: string;
}

export interface ProvinceMutationRuntime {
  find(ref: number | string): ProvinceRef | null;
  rename(i: number, updates: ProvinceRenameUpdates): void;
}

export function findProvinceForRenameInPack(
  pack: Pack | undefined,
  ref: number | string,
): ProvinceRef | null {
  const entry = findEntityByRef(pack?.provinces, ref);
  if (!entry) return null;
  return {
    i: entry.i,
    name: entry.name ?? "",
    formName: entry.formName ?? null,
    fullName: entry.fullName ?? null,
  };
}

export const defaultProvinceMutationRuntime: ProvinceMutationRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawProvince>("provinces"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      formName: entry.formName ?? null,
      fullName: entry.fullName ?? null,
    };
  },
  rename(i: number, updates: ProvinceRenameUpdates): void {
    const provinces = getPackCollection<RawProvince>("provinces");
    const p = provinces?.[i];
    if (!p) throw new Error(`Province ${i} not found.`);
    if (p.removed) throw new Error(`Province ${i} has been removed.`);
    p.name = updates.name;
    if (updates.formName !== undefined) p.formName = updates.formName;
    if (updates.fullName !== undefined) p.fullName = updates.fullName;
    if (typeof document === "undefined") return;
    const label = document.getElementById(`provinceLabel${i}`);
    if (label) label.textContent = updates.name;
  },
};

export function createRenameProvinceTool(
  runtime: ProvinceMutationRuntime = defaultProvinceMutationRuntime,
): Tool {
  return {
    name: "rename_province",
    description:
      "Rename a specific province by id or case-insensitive name/fullName. Optional formName (e.g. 'Duchy', 'County') and fullName update together with the short name. Refreshes the province's SVG label automatically.",
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or the province's current name or fullName.",
        },
        name: {
          type: "string",
          description: "The new short name for the province.",
        },
        formName: {
          type: "string",
          description:
            "Optional new form (e.g. 'Duchy', 'County'). Non-empty if provided.",
        },
        fullName: {
          type: "string",
          description:
            "Optional new full/ceremonial name (e.g. 'Duchy of Rookwood'). Non-empty if provided.",
        },
      },
      required: ["province", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        name?: unknown;
        formName?: unknown;
        fullName?: unknown;
      };

      const refResult = parseEntityRef(input.province, "province");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const parseOptional = (
        field: string,
        v: unknown,
      ): string | null | ToolResult => {
        if (v === undefined || v === null) return null;
        if (typeof v !== "string" || !v.trim())
          return errorResult(
            `${field}, if provided, must be a non-empty string.`,
          );
        return v.trim();
      };

      const formNameResult = parseOptional("formName", input.formName);
      if (formNameResult && typeof formNameResult === "object")
        return formNameResult;
      const fullNameResult = parseOptional("fullName", input.fullName);
      if (fullNameResult && typeof fullNameResult === "object")
        return fullNameResult;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult("Cannot rename province 0 (the placeholder entry).");
      }

      const updates: ProvinceRenameUpdates = { name: input.name.trim() };
      if (typeof formNameResult === "string") updates.formName = formNameResult;
      if (typeof fullNameResult === "string") updates.fullName = fullNameResult;

      try {
        runtime.rename(current.i, updates);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        previousFormName: current.formName,
        previousFullName: current.fullName,
        name: updates.name,
        formName: updates.formName ?? current.formName,
        fullName: updates.fullName ?? current.fullName,
      });
    },
  };
}

export const renameProvinceTool = createRenameProvinceTool();
