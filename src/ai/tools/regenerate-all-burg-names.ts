import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  BURG_NAME_MODES,
  type BurgNameMode,
  resolveBurgNameMode,
} from "./regenerate-burg-name";

interface BurgPack {
  burgs?: RawBurg[];
}

interface NamesModule {
  getCulture?: (culture: number) => string;
  getBase?: (base: number) => string;
}

export interface RegenerateAllBurgNamesCounts {
  regenerated: number;
  skippedLocked: number;
  skippedRemoved: number;
}

export interface RegenerateAllBurgNamesRuntime {
  regenerate(mode: BurgNameMode): RegenerateAllBurgNamesCounts;
}

export const defaultRegenerateAllBurgNamesRuntime: RegenerateAllBurgNamesRuntime =
  {
    regenerate(mode) {
      const pack = getPack<BurgPack>();
      const burgs = pack?.burgs;
      if (!Array.isArray(burgs)) {
        throw new Error("pack.burgs is not available.");
      }
      const names = getGlobal<NamesModule>("Names");
      if (!names) {
        throw new Error(
          "Names is not available yet; the map hasn't finished loading.",
        );
      }
      if (mode === "culture" && typeof names.getCulture !== "function") {
        throw new Error("Names.getCulture is not available.");
      }
      let nameBasesLen = 0;
      if (mode === "random") {
        if (typeof names.getBase !== "function") {
          throw new Error("Names.getBase is not available.");
        }
        const nameBases = getGlobal<unknown[]>("nameBases");
        if (!Array.isArray(nameBases) || nameBases.length === 0) {
          throw new Error("nameBases is not available or empty.");
        }
        nameBasesLen = nameBases.length;
      }

      let regenerated = 0;
      let skippedLocked = 0;
      let skippedRemoved = 0;

      for (const burg of burgs) {
        if (!burg || !burg.i) continue;
        if (burg.removed) {
          skippedRemoved++;
          continue;
        }
        if (burg.lock) {
          skippedLocked++;
          continue;
        }
        const culture = typeof burg.culture === "number" ? burg.culture : 0;
        let newName: string;
        if (mode === "culture") {
          newName = (names.getCulture as (c: number) => string)(culture);
        } else {
          const base = Math.floor(Math.random() * nameBasesLen);
          newName = (names.getBase as (n: number) => string)(base);
        }
        if (typeof newName !== "string" || !newName.trim()) continue;
        burg.name = newName;
        if (typeof document !== "undefined") {
          const label = document.getElementById(`burgLabel${burg.i}`);
          if (label) label.textContent = newName;
        }
        regenerated++;
      }

      return { regenerated, skippedLocked, skippedRemoved };
    },
  };

export function createRegenerateAllBurgNamesTool(
  runtime: RegenerateAllBurgNamesRuntime = defaultRegenerateAllBurgNamesRuntime,
): Tool {
  return {
    name: "regenerate_all_burg_names",
    description: `Bulk-regenerate burg names — same side-effect as the Burgs Overview's "Regenerate names" button. For each non-locked, non-removed burg, picks a fresh name via Names (\`culture\` mode = Names.getCulture(burg.culture); \`random\` mode = Names.getBase(rand)). Writes burg.name and best-effort updates the #burgLabel{i} SVG text. Locked burgs are preserved (burg.lock=true — set via set_entity_lock). Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...BURG_NAME_MODES],
          description: `"culture" (default, matches UI) or "random".`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { mode?: unknown };

      let mode: BurgNameMode = "culture";
      if (input.mode !== undefined && input.mode !== null) {
        const resolved = resolveBurgNameMode(input.mode);
        if (!resolved) {
          return errorResult(`Unknown mode: ${JSON.stringify(input.mode)}.`, {
            supported: [...BURG_NAME_MODES],
          });
        }
        mode = resolved;
      }

      let counts: RegenerateAllBurgNamesCounts;
      try {
        counts = runtime.regenerate(mode);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        mode,
        regenerated: counts.regenerated,
        skippedLocked: counts.skippedLocked,
        skippedRemoved: counts.skippedRemoved,
      });
    },
  };
}

export const regenerateAllBurgNamesTool = createRegenerateAllBurgNamesTool();
