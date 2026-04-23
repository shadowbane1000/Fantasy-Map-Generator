import {
  errorResult,
  getGlobal,
  getPack,
  getPackCollection,
  okResult,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const RIVER_NAME_MODES = ["culture", "random"] as const;

export type RiverNameMode = (typeof RIVER_NAME_MODES)[number];

const LOOKUP = new Map<string, RiverNameMode>();
for (const m of RIVER_NAME_MODES) LOOKUP.set(m.toLowerCase(), m);

export function resolveRiverNameMode(value: unknown): RiverNameMode | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface RegenerateRiverNamesRiverRef {
  i: number;
  name: string;
  mouth: number;
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateRiverNamesRuntime {
  list(): RegenerateRiverNamesRiverRef[];
  generate(mode: RiverNameMode, mouth: number): string;
  apply(i: number, name: string): void;
  redraw(): void;
}

interface NamesModule {
  getCulture?: (culture: number) => string;
  getBase?: (base: number) => string;
}

interface PackWithCultureCells {
  cells?: { culture?: ArrayLike<number> };
}

export const defaultRegenerateRiverNamesRuntime: RegenerateRiverNamesRuntime = {
  list() {
    const rivers = getPackCollection<RawRiver>("rivers");
    if (!Array.isArray(rivers)) {
      throw new Error("pack.rivers is not available.");
    }
    const refs: RegenerateRiverNamesRiverRef[] = [];
    for (const river of rivers) {
      if (!river) continue;
      refs.push({
        i: river.i,
        name: river.name ?? "",
        mouth: typeof river.mouth === "number" ? river.mouth : 0,
        lock: river.lock,
        removed: river.removed,
      });
    }
    return refs;
  },
  generate(mode, mouth) {
    const names = getGlobal<NamesModule>("Names");
    if (!names) {
      throw new Error(
        "Names is not available yet; the map hasn't finished loading.",
      );
    }
    if (mode === "culture") {
      if (typeof names.getCulture !== "function") {
        throw new Error("Names.getCulture is not available.");
      }
      const cultureCells = getPack<PackWithCultureCells>()?.cells?.culture;
      if (!cultureCells) {
        throw new Error("pack.cells.culture is not available.");
      }
      const culture = cultureCells[mouth];
      if (typeof culture !== "number") {
        throw new Error(`pack.cells.culture[${mouth}] is not available.`);
      }
      return names.getCulture(culture);
    }
    if (typeof names.getBase !== "function") {
      throw new Error("Names.getBase is not available.");
    }
    const nameBases = getGlobal<unknown[]>("nameBases");
    if (!Array.isArray(nameBases) || nameBases.length === 0) {
      throw new Error("nameBases is not available or empty.");
    }
    const baseIndex = Math.floor(Math.random() * nameBases.length);
    return names.getBase(baseIndex);
  },
  apply(i, name) {
    const rivers = getPackCollection<RawRiver>("rivers");
    if (!Array.isArray(rivers))
      throw new Error("pack.rivers is not available.");
    const river = rivers.find((r) => r && r.i === i);
    if (!river) throw new Error(`River ${i} not found.`);
    river.name = name;
  },
  redraw() {
    getGlobal<() => void>("drawRivers")?.();
  },
};

export function createRegenerateRiverNamesTool(
  runtime: RegenerateRiverNamesRuntime = defaultRegenerateRiverNamesRuntime,
): Tool {
  return {
    name: "regenerate_river_names",
    description: `Bulk-regenerate names for every non-locked, non-removed river — parallels the Rivers Editor's per-river "Generate" name buttons, applied across the whole map. \`mode=culture\` (default, matches the editor's culture button) calls \`Rivers.getName(river.mouth)\`, i.e. \`Names.getCulture(pack.cells.culture[river.mouth])\` — produces a name seeded by the culture owning the mouth cell. \`mode=random\` picks a random name-base per river and calls \`Names.getBase(base)\`. Writes \`river.name\`. Rivers have no on-map labels (the renderer only emits paths), so no DOM refresh is needed; \`drawRivers()\` is still called once at the end as a best-effort no-op for parity. Rivers removed by \`remove_river\` are skipped. Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...RIVER_NAME_MODES],
          description: `"culture" (default, matches the editor's culture button) or "random".`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { mode?: unknown };

      let mode: RiverNameMode = "culture";
      if (input.mode !== undefined && input.mode !== null) {
        const resolved = resolveRiverNameMode(input.mode);
        if (!resolved) {
          return errorResult(`Unknown mode: ${JSON.stringify(input.mode)}.`, {
            supported: [...RIVER_NAME_MODES],
          });
        }
        mode = resolved;
      }

      let rivers: RegenerateRiverNamesRiverRef[];
      try {
        rivers = runtime.list();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const renamed: Array<{ i: number; previousName: string; name: string }> =
        [];
      const skipped: Array<{ i: number; name: string; reason: string }> = [];

      for (const river of rivers) {
        if (river.removed) {
          skipped.push({ i: river.i, name: river.name, reason: "removed" });
          continue;
        }
        if (river.lock) {
          skipped.push({ i: river.i, name: river.name, reason: "locked" });
          continue;
        }

        let newName: string;
        try {
          newName = runtime.generate(mode, river.mouth);
        } catch (err) {
          skipped.push({
            i: river.i,
            name: river.name,
            reason: `generate failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
        if (typeof newName !== "string" || !newName.trim()) {
          skipped.push({
            i: river.i,
            name: river.name,
            reason: "generator returned empty string",
          });
          continue;
        }

        try {
          runtime.apply(river.i, newName);
        } catch (err) {
          skipped.push({
            i: river.i,
            name: river.name,
            reason: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        renamed.push({
          i: river.i,
          previousName: river.name,
          name: newName,
        });
      }

      try {
        runtime.redraw();
      } catch {
        // Best-effort — partial progress is preserved either way.
      }

      return okResult({ mode, renamed, skipped });
    },
  };
}

export const regenerateRiverNamesTool = createRegenerateRiverNamesTool();
