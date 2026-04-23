import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export interface RegimentRef {
  i: number;
  name: string;
  cell: number;
  n: number;
}

export interface RegimentStateBucket {
  stateId: number;
  stateName: string;
  regiments: RegimentRef[];
}

export interface RegenerateRegimentNamesRuntime {
  list(stateRef: number | string | null): RegimentStateBucket[] | null;
  generate(stateId: number, reg: RegimentRef, siblings: RegimentRef[]): string;
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

function toRegimentRef(r: RawRegiment): RegimentRef {
  return {
    i: r.i,
    name: r.name ?? "",
    cell: typeof r.cell === "number" ? r.cell : 0,
    n: typeof r.n === "number" ? r.n : 0,
  };
}

function buildBucket(state: RawState): RegimentStateBucket {
  const military = Array.isArray(state.military) ? state.military : [];
  const regiments: RegimentRef[] = [];
  for (const r of military) {
    if (!r || typeof r.i !== "number") continue;
    regiments.push(toRegimentRef(r));
  }
  return {
    stateId: state.i,
    stateName: state.name ?? "",
    regiments,
  };
}

export const defaultRegenerateRegimentNamesRuntime: RegenerateRegimentNamesRuntime =
  {
    list(stateRef) {
      const pack = getPack<BurgPackLike>();
      const states = pack?.states;
      if (!Array.isArray(states)) {
        throw new Error("pack.states is not available.");
      }
      if (stateRef !== null && stateRef !== undefined) {
        const stateId = resolveStateRefInPack(pack, stateRef);
        if (stateId === null) return null;
        const state = states[stateId];
        if (!state || state.removed) return null;
        return [buildBucket(state)];
      }
      const buckets: RegimentStateBucket[] = [];
      for (const state of states) {
        if (!state) continue;
        // Mirror drawMilitary: skip Neutrals (i=0) and removed states for the
        // "all" case. Callers can still target state 0 explicitly by passing
        // it as the state ref.
        if (!state.i || state.removed) continue;
        buckets.push(buildBucket(state));
      }
      return buckets;
    },
    generate(_stateId, reg, siblings) {
      const military = getGlobal<MilitaryModule>("Military");
      if (!military || typeof military.getName !== "function") {
        throw new Error(
          "Military.getName is not available yet; the map hasn't finished loading.",
        );
      }
      return military.getName(reg as RawRegiment, siblings as RawRegiment[]);
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

export function createRegenerateRegimentNamesTool(
  runtime: RegenerateRegimentNamesRuntime = defaultRegenerateRegimentNamesRuntime,
): Tool {
  return {
    name: "regenerate_regiment_names",
    description: `Bulk-regenerate names for every regiment across every state (or a single state when \`state\` is supplied) — same side-effect as clicking the Regiment Editor's "Restore Name" button for each regiment. Calls \`Military.getName(reg, siblings)\` per regiment, which produces positional labels like "1st Regiment", "2nd (Rookhold) Regiment", "1st Fleet" (land units get a "Regiment" suffix, naval units get "Fleet"; a province or burg name on the regiment's cell is inserted in parentheses when available; numbering restarts per-state per-naval-flag). Writes \`regiment.name\` and updates the \`#regiment{stateId}-{i}\` SVG \`data-name\` tooltip attribute. Calls \`drawMilitary()\` once at the end. Without \`state\`, all active states (skipping Neutrals/state 0 and removed states) are processed; with \`state\` (numeric id, accepts 0, or case-insensitive name/fullName) only that state's regiments are touched. Regiments have no lock field — every regiment in scope is regenerated. Reports \`renamed\` / \`skipped\` lists keyed by \`(stateI, regimentI)\`.`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Optional state filter. Numeric id (0 = Neutrals is accepted when explicit) or case-insensitive state name / fullName. Omit to process every active state.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { state?: unknown };

      let stateRef: number | string | null = null;
      if (input.state !== undefined && input.state !== null) {
        if (!isValidStateRef(input.state)) {
          return errorResult(
            "state must be a non-negative integer id or a non-empty name string.",
          );
        }
        stateRef = input.state as number | string;
      }

      let buckets: RegimentStateBucket[] | null;
      try {
        buckets = runtime.list(stateRef);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (buckets === null) {
        return errorResult(
          `Could not resolve state ${JSON.stringify(stateRef)}.`,
        );
      }

      const renamed: Array<{
        stateI: number;
        regimentI: number;
        previousName: string;
        name: string;
      }> = [];
      const skipped: Array<{
        stateI: number;
        regimentI: number;
        name: string;
        reason: string;
      }> = [];

      const resolvedStateId: number | null =
        buckets.length === 1 && stateRef !== null ? buckets[0].stateId : null;

      for (const bucket of buckets) {
        for (const reg of bucket.regiments) {
          let newName: string;
          try {
            newName = runtime.generate(bucket.stateId, reg, bucket.regiments);
          } catch (err) {
            skipped.push({
              stateI: bucket.stateId,
              regimentI: reg.i,
              name: reg.name,
              reason: `generate failed: ${err instanceof Error ? err.message : String(err)}`,
            });
            continue;
          }
          if (typeof newName !== "string" || !newName.trim()) {
            skipped.push({
              stateI: bucket.stateId,
              regimentI: reg.i,
              name: reg.name,
              reason: "generator returned empty string",
            });
            continue;
          }

          try {
            runtime.apply(bucket.stateId, reg.i, newName);
          } catch (err) {
            skipped.push({
              stateI: bucket.stateId,
              regimentI: reg.i,
              name: reg.name,
              reason: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
            });
            continue;
          }

          renamed.push({
            stateI: bucket.stateId,
            regimentI: reg.i,
            previousName: reg.name,
            name: newName,
          });
        }
      }

      try {
        runtime.redraw();
      } catch {
        // Best-effort — partial progress is preserved either way.
      }

      return okResult({ state: resolvedStateId, renamed, skipped });
    },
  };
}

export const regenerateRegimentNamesTool = createRegenerateRegimentNamesTool();
