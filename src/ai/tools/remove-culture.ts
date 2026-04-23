import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCulture,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithCultureCells {
  cells?: { culture?: number[] };
  cultures?: RawCulture[];
  states?: RawState[];
  burgs?: RawBurg[];
}

export interface RemoveCultureRef {
  i: number;
  name: string;
}

export interface RemoveCultureResult {
  cascadedOrigins: number;
  reassignedBurgs: number;
  reassignedStates: number;
}

export interface RemoveCultureRuntime {
  find(ref: number | string): RemoveCultureRef | null;
  remove(ref: RemoveCultureRef): RemoveCultureResult;
}

export const defaultRemoveCultureRuntime: RemoveCultureRuntime = {
  find(ref) {
    const pack = getPack<PackWithCultureCells>();
    const entry = findEntityByRef(pack?.cultures, ref);
    if (!entry) return null;
    return { i: entry.i, name: entry.name ?? "" };
  },
  remove(ref) {
    const pack = getPack<PackWithCultureCells>();
    if (!pack) throw new Error("pack is not available.");
    const cultures = pack.cultures;
    if (!Array.isArray(cultures)) {
      throw new Error("pack.cultures is not available.");
    }

    let reassignedBurgs = 0;
    for (const b of pack.burgs ?? []) {
      if (!b || !b.i || b.removed) continue;
      if (b.culture === ref.i) {
        b.culture = 0;
        reassignedBurgs++;
      }
    }

    let reassignedStates = 0;
    for (const s of pack.states ?? []) {
      if (!s || !s.i || s.removed) continue;
      if (s.culture === ref.i) {
        s.culture = 0;
        reassignedStates++;
      }
    }

    const cellCulture = pack.cells?.culture;
    if (Array.isArray(cellCulture)) {
      for (let k = 0; k < cellCulture.length; k++) {
        if (cellCulture[k] === ref.i) cellCulture[k] = 0;
      }
    }

    const target = cultures[ref.i];
    if (!target) throw new Error(`Culture ${ref.i} not found.`);
    target.removed = true;

    let cascadedOrigins = 0;
    for (const c of cultures) {
      if (!c || !c.i || c.i === ref.i || c.removed) continue;
      if (!Array.isArray(c.origins)) continue;
      if (!c.origins.includes(ref.i)) continue;
      const filtered = c.origins.filter((o) => o !== ref.i);
      c.origins = filtered.length ? filtered : [0];
      cascadedOrigins++;
    }

    if (typeof document !== "undefined") {
      document.getElementById(`culture${ref.i}`)?.remove();
      document.getElementById(`cultureCenter${ref.i}`)?.remove();
    }

    return { cascadedOrigins, reassignedBurgs, reassignedStates };
  },
};

export function createRemoveCultureTool(
  runtime: RemoveCultureRuntime = defaultRemoveCultureRuntime,
): Tool {
  return {
    name: "remove_culture",
    description:
      "Delete a culture — same side-effect as the Cultures Editor trash icon. Reassigns every active burg and state with `culture === i` to culture 0 (Wildlands), zeroes every `pack.cells.culture[cell]` referencing this culture, writes `pack.cultures[i].removed = true` (tombstone — other fields preserved), filters the removed id out of every other active culture's `origins` array (resetting empty arrays to `[0]`), and best-effort removes the `#culture{i}` / `#cultureCenter{i}` SVG elements. Response includes cascadedOrigins + reassignedBurgs + reassignedStates counts. Rejects Wildlands (id 0) and already-removed cultures.",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (> 0) or case-insensitive current name.",
        },
      },
      required: ["culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { culture?: unknown };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult("Cannot remove culture 0 (Wildlands).");
      }

      let result: RemoveCultureResult;
      try {
        result = runtime.remove(current);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        cascadedOrigins: result.cascadedOrigins,
        reassignedBurgs: result.reassignedBurgs,
        reassignedStates: result.reassignedStates,
      });
    },
  };
}

export const removeCultureTool = createRemoveCultureTool();
