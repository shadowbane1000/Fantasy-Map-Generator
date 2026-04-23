import {
  errorResult,
  findEntityByRef,
  getPack,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ReligionCenterRef {
  i: number;
  name: string;
  previousCenter: number;
  locked: boolean;
}

export interface ReligionCenterRuntime {
  find(ref: number | string): ReligionCenterRef | null;
  getCellCount(): number;
  apply(i: number, cell: number): void;
}

interface PackWithCellsI {
  cells?: { i?: unknown[] };
}

export const defaultReligionCenterRuntime: ReligionCenterRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousCenter: typeof entry.center === "number" ? entry.center : 0,
      locked: !!entry.lock,
    };
  },
  getCellCount() {
    const cellsI = getPack<PackWithCellsI>()?.cells?.i;
    return Array.isArray(cellsI) ? cellsI.length : 0;
  },
  apply(i: number, cell: number): void {
    const religions = getPackCollection<RawReligion>("religions");
    const religion = religions?.[i];
    if (!religion) throw new Error(`Religion ${i} not found.`);
    if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
    religion.center = cell;
  },
};

export function createSetReligionCenterTool(
  runtime: ReligionCenterRuntime = defaultReligionCenterRuntime,
): Tool {
  return {
    name: "set_religion_center",
    description:
      "Change a religion's center cell (its origin / seed cell) — same data mutation as dragging the religion-center handle in the Religions Editor. Writes pack.religions[i].center to the supplied cell id. The center seeds the religion's expansion and is shown as the #religionsCenter{i} marker while the Religions Editor is open. Matches religion by id (>0) or case-insensitive name. Rejects the 'No religion' placeholder (religion 0), removed religions, and locked religions. Validates the cell id is within pack.cells.i bounds. Idempotent — supplying the current center returns a noop.",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        cell: {
          type: "integer",
          description:
            "Target cell index (0 ≤ cell < pack.cells.i.length). Any valid cell id is accepted — the tool does not enforce the Religions Editor's water-cell guard.",
        },
      },
      required: ["religion", "cell"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        cell?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);

      if (
        typeof input.cell !== "number" ||
        !Number.isInteger(input.cell) ||
        input.cell < 0
      ) {
        return errorResult("cell must be a non-negative integer.");
      }
      const cell = input.cell;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set center on religion 0 (the 'No religion' placeholder).",
        );
      }
      if (current.locked) {
        return errorResult(
          `Religion ${current.i} (${JSON.stringify(current.name)}) is locked. Unlock it first via set_entity_lock.`,
        );
      }

      const cellCount = runtime.getCellCount();
      if (cellCount <= 0) {
        return errorResult(
          "pack.cells.i is not available yet; wait for the map to finish loading.",
        );
      }
      if (cell >= cellCount) {
        return errorResult(
          `cell ${cell} is out of range (0 <= cell < ${cellCount}).`,
        );
      }

      if (cell === current.previousCenter) {
        return okResult({
          i: current.i,
          name: current.name,
          previousCenter: current.previousCenter,
          center: cell,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, cell);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousCenter: current.previousCenter,
        center: cell,
        noop: false,
      });
    },
  };
}

export const setReligionCenterTool = createSetReligionCenterTool();
