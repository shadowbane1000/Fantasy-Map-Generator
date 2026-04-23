import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getNotes,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawNote,
  type RawProvince,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithStateCells {
  cells?: {
    state?: number[];
    province?: number[];
  };
  states?: RawState[];
  provinces?: RawProvince[];
  burgs?: RawBurg[];
}

export interface RemoveStateRef {
  i: number;
  name: string;
  fullName: string;
  provinces: number[];
  military: RawRegiment[];
}

export interface RemoveStateResult {
  reassignedBurgs: number;
  removedProvinces: number;
  removedRegiments: number;
  neighborsCleaned: number;
}

export interface RemoveStateRuntime {
  find(ref: number | string): RemoveStateRef | null;
  remove(ref: RemoveStateRef): RemoveStateResult;
}

function removeElementById(id: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.remove();
}

function removeAttrMatch(parentId: string, tag: string, dataI: number): void {
  if (typeof document === "undefined") return;
  const parent = document.getElementById(parentId);
  parent?.querySelector(`${tag}[data-i='${dataI}']`)?.remove();
}

export const defaultRemoveStateRuntime: RemoveStateRuntime = {
  find(ref) {
    const pack = getPack<PackWithStateCells>();
    const entry = findEntityByRef(pack?.states, ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      fullName: entry.fullName ?? "",
      provinces: Array.isArray(entry.provinces) ? [...entry.provinces] : [],
      military: Array.isArray(entry.military) ? [...entry.military] : [],
    };
  },
  remove(ref) {
    const pack = getPack<PackWithStateCells>();
    if (!pack) throw new Error("pack is not available.");
    const states = pack.states;
    if (!Array.isArray(states)) {
      throw new Error("pack.states is not available.");
    }

    let reassignedBurgs = 0;
    for (const burg of pack.burgs ?? []) {
      if (!burg || !burg.i || burg.removed) continue;
      if (burg.state === ref.i) {
        burg.state = 0;
        if (burg.capital) burg.capital = 0;
        reassignedBurgs++;
      }
    }

    const cellState = pack.cells?.state;
    if (Array.isArray(cellState)) {
      for (let k = 0; k < cellState.length; k++) {
        if (cellState[k] === ref.i) cellState[k] = 0;
      }
    }

    const provinces = pack.provinces;
    const cellProv = pack.cells?.province;
    let removedProvinces = 0;
    for (const p of ref.provinces) {
      if (!Array.isArray(provinces) || !provinces[p]) continue;
      provinces[p] = { i: p, removed: true } as RawProvince;
      if (Array.isArray(cellProv)) {
        for (let k = 0; k < cellProv.length; k++) {
          if (cellProv[k] === p) cellProv[k] = 0;
        }
      }
      removeElementById(`provinceCOA${p}`);
      removeAttrMatch("provinceEmblems", "use", p);
      removeElementById(`province${p}`);
      removeElementById(`province-gap${p}`);
      removedProvinces++;
    }

    let removedRegiments = 0;
    const notes = getNotes<RawNote>() as RawNote[] | undefined;
    if (Array.isArray(notes)) {
      for (const reg of ref.military) {
        if (!reg || typeof reg.i !== "number") continue;
        const targetId = `regiment${ref.i}-${reg.i}`;
        const idx = notes.findIndex((n) => n && n.id === targetId);
        if (idx >= 0) {
          notes.splice(idx, 1);
          removedRegiments++;
        }
      }
    }
    removeElementById(`army${ref.i}`);

    let neighborsCleaned = 0;
    for (const s of states) {
      if (!s || !s.i || s.removed || s.i === ref.i) continue;
      if (!Array.isArray(s.neighbors)) continue;
      if (!s.neighbors.includes(ref.i)) continue;
      s.neighbors = s.neighbors.filter((n) => n !== ref.i);
      neighborsCleaned++;
    }

    states[ref.i] = { i: ref.i, removed: true } as RawState;

    removeElementById(`state${ref.i}`);
    removeElementById(`state-gap${ref.i}`);
    removeElementById(`state-border${ref.i}`);
    removeElementById(`stateLabel${ref.i}`);
    removeElementById(`textPath_stateLabel${ref.i}`);
    removeElementById(`stateCOA${ref.i}`);
    removeAttrMatch("stateEmblems", "use", ref.i);

    try {
      getGlobal<(key: string) => void>("unfog")?.(`focusState${ref.i}`);
    } catch {
      // Best-effort.
    }
    for (const fn of ["drawStates", "drawBorders", "drawProvinces"] as const) {
      try {
        getGlobal<() => void>(fn)?.();
      } catch {
        // Best-effort.
      }
    }

    return {
      reassignedBurgs,
      removedProvinces,
      removedRegiments,
      neighborsCleaned,
    };
  },
};

export function createRemoveStateTool(
  runtime: RemoveStateRuntime = defaultRemoveStateRuntime,
): Tool {
  return {
    name: "remove_state",
    description:
      "Delete a state — same side-effect as the States Editor trash icon. Cascades across many pack collections: reassigns burgs in the state to neutral (clearing capital flag), zeroes pack.cells.state, tombstones every province of this state (including cells.province cleanup), splices the state's regiments from the global notes, filters the id out of every other state's neighbors, and tombstones pack.states[i] (replaces with {i, removed: true} — matches UI by wiping the name). Best-effort DOM cleanup (state / province / army SVG) and drawStates / drawBorders / drawProvinces redraws. Rejects Neutrals (id 0) and already-removed states. Response includes counts for all four cascades.",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or case-insensitive name / fullName.",
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { state?: unknown };

      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult("Cannot remove state 0 (Neutrals).");
      }

      let result: RemoveStateResult;
      try {
        result = runtime.remove(current);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        fullName: current.fullName,
        reassignedBurgs: result.reassignedBurgs,
        removedProvinces: result.removedProvinces,
        removedRegiments: result.removedRegiments,
        neighborsCleaned: result.neighborsCleaned,
      });
    },
  };
}

export const removeStateTool = createRemoveStateTool();
