import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithProvinceCells {
  cells?: { province?: number[] };
  provinces?: RawProvince[];
  states?: RawState[];
}

export interface RemoveProvinceRef {
  i: number;
  name: string;
  fullName: string;
  stateId: number;
}

export interface RemoveProvinceRuntime {
  find(ref: number | string): RemoveProvinceRef | null;
  remove(ref: RemoveProvinceRef): void;
}

export const defaultRemoveProvinceRuntime: RemoveProvinceRuntime = {
  find(ref) {
    const pack = getPack<PackWithProvinceCells>();
    const entry = findEntityByRef(pack?.provinces, ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      fullName: entry.fullName ?? "",
      stateId: typeof entry.state === "number" ? entry.state : 0,
    };
  },
  remove(ref) {
    const pack = getPack<PackWithProvinceCells>();
    if (!pack) throw new Error("pack is not available.");
    const provinces = pack.provinces;
    if (!Array.isArray(provinces)) {
      throw new Error("pack.provinces is not available.");
    }
    const cellProv = pack.cells?.province;
    if (Array.isArray(cellProv)) {
      for (let k = 0; k < cellProv.length; k++) {
        if (cellProv[k] === ref.i) cellProv[k] = 0;
      }
    }
    const state = pack.states?.[ref.stateId];
    if (state && Array.isArray(state.provinces)) {
      const idx = state.provinces.indexOf(ref.i);
      if (idx >= 0) state.provinces.splice(idx, 1);
    }
    provinces[ref.i] = { i: ref.i, removed: true } as RawProvince;

    try {
      getGlobal<(key: string) => void>("unfog")?.(`focusProvince${ref.i}`);
    } catch {
      // Best-effort.
    }

    if (typeof document !== "undefined") {
      document.getElementById(`provinceCOA${ref.i}`)?.remove();
      document
        .querySelector(`#provinceEmblems use[data-i='${ref.i}']`)
        ?.remove();
      const body = document.getElementById("provincesBody");
      body?.querySelector(`#province${ref.i}`)?.remove();
      body?.querySelector(`#province-gap${ref.i}`)?.remove();
    }

    try {
      getGlobal<() => void>("drawBorders")?.();
    } catch {
      // Best-effort.
    }
  },
};

export function createRemoveProvinceTool(
  runtime: RemoveProvinceRuntime = defaultRemoveProvinceRuntime,
): Tool {
  return {
    name: "remove_province",
    description:
      "Delete a province — same side-effect as the Provinces Editor trash icon. Zeroes every pack.cells.province[cell] that referenced this province, splices the id out of pack.states[state].provinces, writes pack.provinces[i] = { i, removed: true } (the tombstone pattern used throughout the pack so array indices stay stable), removes the COA / province SVG elements, calls unfog('focusProvince{i}'), and best-effort calls drawBorders() to refresh the borders layer. Rejects id 0 (placeholder) and already-removed provinces.",
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or case-insensitive name / fullName.",
        },
      },
      required: ["province"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { province?: unknown };

      const refResult = parseEntityRef(input.province, "province");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.remove(current);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        fullName: current.fullName,
        state: current.stateId,
      });
    },
  };
}

export const removeProvinceTool = createRemoveProvinceTool();
