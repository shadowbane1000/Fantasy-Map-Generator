import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithReligionCells {
  cells?: { religion?: number[] };
  religions?: RawReligion[];
}

export interface RemoveReligionRef {
  i: number;
  name: string;
}

export interface RemoveReligionResult {
  cascadedOrigins: number;
}

export interface RemoveReligionRuntime {
  find(ref: number | string): RemoveReligionRef | null;
  remove(ref: RemoveReligionRef): RemoveReligionResult;
}

export const defaultRemoveReligionRuntime: RemoveReligionRuntime = {
  find(ref) {
    const pack = getPack<PackWithReligionCells>();
    const entry = findEntityByRef(pack?.religions, ref);
    if (!entry) return null;
    return { i: entry.i, name: entry.name ?? "" };
  },
  remove(ref) {
    const pack = getPack<PackWithReligionCells>();
    if (!pack) throw new Error("pack is not available.");
    const religions = pack.religions;
    if (!Array.isArray(religions)) {
      throw new Error("pack.religions is not available.");
    }
    const cellRel = pack.cells?.religion;
    if (Array.isArray(cellRel)) {
      for (let k = 0; k < cellRel.length; k++) {
        if (cellRel[k] === ref.i) cellRel[k] = 0;
      }
    }
    const target = religions[ref.i];
    if (!target) throw new Error(`Religion ${ref.i} not found.`);
    target.removed = true;

    let cascadedOrigins = 0;
    for (const r of religions) {
      if (!r || !r.i || r.i === ref.i || r.removed) continue;
      if (!Array.isArray(r.origins)) continue;
      if (!r.origins.includes(ref.i)) continue;
      const filtered = r.origins.filter((o) => o !== ref.i);
      r.origins = filtered.length ? filtered : [0];
      cascadedOrigins++;
    }

    if (typeof document !== "undefined") {
      document.getElementById(`religion${ref.i}`)?.remove();
      document.getElementById(`religion-gap${ref.i}`)?.remove();
      document.getElementById(`religionsCenter${ref.i}`)?.remove();
    }

    return { cascadedOrigins };
  },
};

export function createRemoveReligionTool(
  runtime: RemoveReligionRuntime = defaultRemoveReligionRuntime,
): Tool {
  return {
    name: "remove_religion",
    description:
      'Delete a religion — same side-effect as the Religions Editor trash icon. Zeroes every pack.cells.religion[cell] that referenced this religion, writes pack.religions[i].removed = true (tombstone — other fields preserved), filters the removed id out of every other religion\'s `origins` array (resetting any emptied array back to [0]), and best-effort removes the #religion{i}, #religion-gap{i}, and #religionsCenter{i} SVG elements. Response includes cascadedOrigins (count of other religions whose origins were touched). Rejects the "No religion" placeholder (id 0) and already-removed entries.',
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
      },
      required: ["religion"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { religion?: unknown };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot remove religion 0 (the 'No religion' placeholder).",
        );
      }

      let result: RemoveReligionResult;
      try {
        result = runtime.remove(current);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        cascadedOrigins: result.cascadedOrigins,
      });
    },
  };
}

export const removeReligionTool = createRemoveReligionTool();
