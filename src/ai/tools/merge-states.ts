import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getNotes,
  getPack,
  isActive,
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
  cells?: { state?: number[] };
  states?: RawState[];
  burgs?: RawBurg[];
  provinces?: RawProvince[];
}

interface StatesModule {
  getPoles?: () => void;
}

export interface MergeStatesRef {
  rulingStateId: number;
  rulingStateName: string;
  fromIds: number[];
  fromNames: string[];
}

export interface MergeStatesCounts {
  mergedStates: number;
  reassignedBurgs: number;
  demotedCapitals: number;
  reassignedProvinces: number;
  reassignedRegiments: number;
}

export interface MergeStatesRuntime {
  resolve(
    into: number | string,
    from: (number | string)[],
  ): MergeStatesRef | string;
  merge(ref: MergeStatesRef): MergeStatesCounts;
}

function removeElementById(id: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.remove();
}

export const defaultMergeStatesRuntime: MergeStatesRuntime = {
  resolve(into, from) {
    const states = getPack<PackWithStateCells>()?.states;
    if (!Array.isArray(states)) return "pack.states is not available.";
    const ruling = findEntityByRef(states, into);
    if (!ruling) return `No state found matching ${JSON.stringify(into)}.`;
    if (!isActive(ruling)) {
      return `State ${ruling.i} is Neutrals or already removed.`;
    }
    const fromIds: number[] = [];
    const fromNames: string[] = [];
    const seen = new Set<number>();
    for (const ref of from) {
      const entry = findEntityByRef(states, ref);
      if (!entry) return `No state found matching ${JSON.stringify(ref)}.`;
      if (!isActive(entry)) {
        return `State ${entry.i} is Neutrals or already removed.`;
      }
      if (entry.i === ruling.i) {
        return "from must not contain the ruling state.";
      }
      if (seen.has(entry.i)) continue;
      seen.add(entry.i);
      fromIds.push(entry.i);
      fromNames.push(entry.name ?? "");
    }
    return {
      rulingStateId: ruling.i,
      rulingStateName: ruling.name ?? "",
      fromIds,
      fromNames,
    };
  },
  merge(ref) {
    const pack = getPack<PackWithStateCells>();
    if (!pack) throw new Error("pack is not available.");
    const states = pack.states;
    if (!Array.isArray(states)) {
      throw new Error("pack.states is not available.");
    }
    const rulingState = states[ref.rulingStateId];
    if (!rulingState) {
      throw new Error(`Ruling state ${ref.rulingStateId} not found.`);
    }
    const notes = getNotes<RawNote>() as RawNote[] | undefined;
    if (!Array.isArray(rulingState.military)) {
      rulingState.military = [];
    }

    let reassignedRegiments = 0;
    for (const fromId of ref.fromIds) {
      const state = states[fromId];
      if (!state) continue;
      state.removed = true;
      removeElementById(`state${fromId}`);
      removeElementById(`state-gap${fromId}`);
      removeElementById(`state-border${fromId}`);
      removeElementById(`stateLabel${fromId}`);
      removeElementById(`textPath_stateLabel${fromId}`);
      removeElementById(`stateCOA${fromId}`);
      if (typeof document !== "undefined") {
        document
          .querySelector(`#stateEmblems use[data-i='${fromId}']`)
          ?.remove();
      }

      if (Array.isArray(state.military)) {
        for (const reg of state.military) {
          if (!reg || typeof reg.i !== "number") continue;
          const newIndex = rulingState.military.length;
          const newReg: RawRegiment = {
            ...reg,
            i: newIndex,
            state: ref.rulingStateId,
          };
          rulingState.military.push(newReg);

          const oldId = `regiment${fromId}-${reg.i}`;
          const newId = `regiment${ref.rulingStateId}-${newIndex}`;
          if (Array.isArray(notes)) {
            const note = notes.find((n) => n && n.id === oldId);
            if (note) note.id = newId;
          }
          if (typeof document !== "undefined") {
            const el = document.getElementById(oldId);
            if (el) el.id = newId;
          }
          reassignedRegiments++;
        }
      }
      removeElementById(`army${fromId}`);
    }

    const fromSet = new Set(ref.fromIds);
    let reassignedBurgs = 0;
    let demotedCapitals = 0;
    for (const burg of pack.burgs ?? []) {
      if (!burg || !burg.i || burg.removed) continue;
      if (typeof burg.state === "number" && fromSet.has(burg.state)) {
        if (burg.capital) {
          burg.capital = 0;
          demotedCapitals++;
        }
        burg.state = ref.rulingStateId;
        reassignedBurgs++;
      }
    }

    let reassignedProvinces = 0;
    for (const province of pack.provinces ?? []) {
      if (!province || !province.i || province.removed) continue;
      if (typeof province.state === "number" && fromSet.has(province.state)) {
        province.state = ref.rulingStateId;
        reassignedProvinces++;
      }
    }

    const cellState = pack.cells?.state;
    if (Array.isArray(cellState)) {
      for (let k = 0; k < cellState.length; k++) {
        if (fromSet.has(cellState[k])) cellState[k] = ref.rulingStateId;
      }
    }

    try {
      getGlobal<() => void>("unfog")?.();
    } catch {
      // Best-effort.
    }
    try {
      const module = getGlobal<StatesModule>("States");
      module?.getPoles?.();
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
    try {
      getGlobal<(ids: number[]) => void>("drawStateLabels")?.([
        ref.rulingStateId,
      ]);
    } catch {
      // Best-effort.
    }

    return {
      mergedStates: ref.fromIds.length,
      reassignedBurgs,
      demotedCapitals,
      reassignedProvinces,
      reassignedRegiments,
    };
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createMergeStatesTool(
  runtime: MergeStatesRuntime = defaultMergeStatesRuntime,
): Tool {
  return {
    name: "merge_states",
    description:
      "Merge one or more states into a single ruling state — same side-effect as the States Editor's Merge dialog. The ruling state keeps its name / color / capital; each merged state is marked removed. Cascades: regiments are moved into the ruling state's military with fresh per-state indices (and matching notes renamed from regiment{oldState}-{oldI} → regiment{rulingState}-{newI}); burgs and provinces are reassigned; burg-capital flags on merged capitals are cleared; pack.cells.state entries are rewritten. Best-effort: unfog, States.getPoles, drawStates / drawBorders / drawProvinces / drawStateLabels, and DOM cleanup for removed state SVG. Rejects Neutrals (id 0) as either ruling or merged, and rejects from-lists that contain the ruling state.",
    input_schema: {
      type: "object",
      properties: {
        into: {
          type: ["integer", "string"],
          description:
            "Ruling state — numeric id (> 0) or case-insensitive name / fullName. Keeps its identity.",
        },
        from: {
          type: "array",
          minItems: 1,
          items: { type: ["integer", "string"] },
          description:
            "States to absorb (each int id or case-insensitive name). Must not include the ruling state.",
        },
      },
      required: ["into", "from"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { into?: unknown; from?: unknown };

      const intoResult = parseEntityRef(input.into, "into");
      if (!intoResult.ok) return errorResult(intoResult.error);

      if (!Array.isArray(input.from) || input.from.length === 0) {
        return errorResult("from must be a non-empty array.");
      }
      for (const item of input.from) {
        if (!isValidRef(item)) {
          return errorResult(
            "each `from` entry must be a positive integer id or a non-empty name string.",
          );
        }
      }
      const fromRefs = input.from as (number | string)[];

      const resolved = runtime.resolve(intoResult.ref, fromRefs);
      if (typeof resolved === "string") {
        return errorResult(resolved);
      }

      let counts: MergeStatesCounts;
      try {
        counts = runtime.merge(resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        into: {
          i: resolved.rulingStateId,
          name: resolved.rulingStateName,
        },
        from: resolved.fromIds.map((i, idx) => ({
          i,
          name: resolved.fromNames[idx] ?? "",
        })),
        mergedStates: counts.mergedStates,
        reassignedBurgs: counts.reassignedBurgs,
        demotedCapitals: counts.demotedCapitals,
        reassignedProvinces: counts.reassignedProvinces,
        reassignedRegiments: counts.reassignedRegiments,
      });
    },
  };
}

export const mergeStatesTool = createMergeStatesTool();
