import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRegiment,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export interface RegenerateRegimentNameRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
}

export type RegenerateRegimentNameFindResult =
  | { kind: "ok"; ref: RegenerateRegimentNameRef }
  | { kind: "state-not-found"; ref: number | string }
  | { kind: "state-inactive"; stateId: number }
  | { kind: "no-military"; stateId: number; stateName: string }
  | {
      kind: "regiment-not-found";
      stateId: number;
      stateName: string;
      ref: number | string;
    }
  | {
      kind: "regiment-ambiguous";
      stateId: number;
      stateName: string;
      name: string;
      candidates: Array<{ i: number; name: string }>;
    };

export interface RegenerateRegimentNameRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): RegenerateRegimentNameFindResult;
  generate(stateId: number, ref: RegenerateRegimentNameRef): string;
  apply(stateId: number, regimentI: number, name: string): void;
  redraw(): void;
}

interface MilitaryModule {
  getName?: (reg: RawRegiment, military: RawRegiment[]) => string;
}

function isValidStateRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRegRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

/** Match every regiment whose id (numeric ref) or case-insensitive name (string
 *  ref) matches. Numeric refs return at most one element; string refs may
 *  return multiple, which the caller treats as ambiguous. */
export function findRegimentMatches(
  military: RawRegiment[] | undefined,
  ref: number | string,
): RawRegiment[] {
  if (!Array.isArray(military)) return [];
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return [];
    const r = military.find((m) => m && m.i === ref);
    return r ? [r] : [];
  }
  if (typeof ref !== "string") return [];
  const needle = ref.trim().toLowerCase();
  if (!needle) return [];
  const matches: RawRegiment[] = [];
  for (const r of military) {
    if (!r) continue;
    if ((r.name ?? "").toLowerCase() === needle) matches.push(r);
  }
  return matches;
}

export const defaultRegenerateRegimentNameRuntime: RegenerateRegimentNameRuntime =
  {
    find(stateRef, regRef) {
      const pack = getPack<BurgPackLike>();
      const stateId = resolveStateRefInPack(pack, stateRef);
      if (stateId === null) return { kind: "state-not-found", ref: stateRef };
      if (stateId === 0) return { kind: "state-inactive", stateId };
      const state = pack?.states?.[stateId];
      if (!state || state.removed) return { kind: "state-inactive", stateId };
      const military = Array.isArray(state.military) ? state.military : [];
      if (military.length === 0) {
        return {
          kind: "no-military",
          stateId,
          stateName: state.name ?? "",
        };
      }
      const matches = findRegimentMatches(military, regRef);
      if (matches.length === 0) {
        return {
          kind: "regiment-not-found",
          stateId,
          stateName: state.name ?? "",
          ref: regRef,
        };
      }
      if (matches.length > 1) {
        return {
          kind: "regiment-ambiguous",
          stateId,
          stateName: state.name ?? "",
          name: typeof regRef === "string" ? regRef : String(regRef),
          candidates: matches.map((m) => ({ i: m.i, name: m.name ?? "" })),
        };
      }
      const reg = matches[0];
      return {
        kind: "ok",
        ref: {
          stateId,
          stateName: state.name ?? "",
          i: reg.i,
          name: reg.name ?? "",
        },
      };
    },
    generate(stateId, _ref) {
      const military = getGlobal<MilitaryModule>("Military");
      if (!military || typeof military.getName !== "function") {
        throw new Error(
          "Military.getName is not available; the map hasn't finished loading.",
        );
      }
      const pack = getPack<BurgPackLike>();
      const state = pack?.states?.[stateId];
      const siblings = Array.isArray(state?.military) ? state.military : [];
      const regiment = siblings.find((r) => r && r.i === _ref.i);
      if (!regiment) {
        throw new Error(
          `Regiment ${_ref.i} not found in state ${_ref.stateName}.`,
        );
      }
      return military.getName(regiment, siblings);
    },
    apply(stateId, regimentI, name) {
      const pack = getPack<BurgPackLike>();
      const state = pack?.states?.[stateId];
      if (!state) throw new Error(`State ${stateId} not found.`);
      const military = Array.isArray(state.military) ? state.military : [];
      const regiment = military.find((r) => r && r.i === regimentI);
      if (!regiment) {
        throw new Error(`Regiment ${regimentI} not found in state ${stateId}.`);
      }
      regiment.name = name;
      if (typeof document === "undefined") return;
      document
        .getElementById(`regiment${stateId}-${regimentI}`)
        ?.setAttribute("data-name", name);
    },
    redraw() {
      getGlobal<() => void>("drawMilitary")?.();
    },
  };

export function createRegenerateRegimentNameTool(
  runtime: RegenerateRegimentNameRuntime = defaultRegenerateRegimentNameRuntime,
): Tool {
  return {
    name: "regenerate_regiment_name",
    description: `Regenerate the procedural name of a single regiment — same side-effect as the Regiment Editor's "Restore name" button. Calls Military.getName(reg, siblings), which produces positional labels like "1st Regiment", "2nd (Rookhold) Regiment", "1st Fleet" (land units get a "Regiment" suffix, naval units get "Fleet"; numbering restarts per-state per-naval-flag). Regiment ids are per-state (not globally unique), so provide BOTH the owning state (id > 0 or case-insensitive name/fullName) and the regiment (numeric regiment.i or case-insensitive current name within that state). Writes regiment.name and best-effort updates the #regiment{stateId}-{i} SVG data-name attribute, then calls drawMilitary().`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Owning state — numeric id (> 0) or case-insensitive state name / fullName. State 0 (Neutrals) is rejected.",
        },
        regiment: {
          type: ["integer", "string"],
          description:
            "Numeric regiment id (regiment.i, per-state, integer >= 0) or case-insensitive current regiment name within that state.",
        },
      },
      required: ["state", "regiment"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        regiment?: unknown;
      };

      if (!isValidStateRef(input.state)) {
        return errorResult(
          "state must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (!isValidRegRef(input.regiment)) {
        return errorResult(
          "regiment must be a non-negative integer id or a non-empty name string.",
        );
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;

      let found: RegenerateRegimentNameFindResult;
      try {
        found = runtime.find(stateRef, regRef);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (found.kind === "state-not-found") {
        return errorResult(`State ${JSON.stringify(found.ref)} not found.`);
      }
      if (found.kind === "state-inactive") {
        return errorResult(
          "Cannot regenerate regiment for state 0 / removed state.",
        );
      }
      if (found.kind === "no-military") {
        return errorResult(`State ${found.stateId} has no military regiments.`);
      }
      if (found.kind === "regiment-not-found") {
        return errorResult(
          `Regiment ${JSON.stringify(found.ref)} not found in state ${found.stateName}.`,
        );
      }
      if (found.kind === "regiment-ambiguous") {
        return errorResult(
          `Multiple regiments match name '${found.name}' in state ${found.stateName}. Disambiguate by id.`,
          { candidates: found.candidates },
        );
      }

      const current = found.ref;
      // Capture previousName BEFORE any mutation. Do not re-read the regiment
      // after apply — that would yield the new name.
      const previousName = current.name;

      let newName: string;
      try {
        newName = runtime.generate(current.stateId, current);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (typeof newName !== "string" || !newName.trim()) {
        return errorResult("Name generator returned an empty string.");
      }

      try {
        runtime.apply(current.stateId, current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.redraw();
      } catch {
        // Best-effort — the rename is already committed.
      }

      return okResult({
        state: { i: current.stateId, name: current.stateName },
        regiment: {
          i: current.i,
          previous_name: previousName,
          name: newName,
        },
      });
    },
  };
}

export const regenerateRegimentNameTool = createRegenerateRegimentNameTool();
