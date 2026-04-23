import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const CULTURE_NAME_MODES = ["culture", "random"] as const;

export type CultureNameMode = (typeof CULTURE_NAME_MODES)[number];

const LOOKUP = new Map<string, CultureNameMode>();
for (const m of CULTURE_NAME_MODES) LOOKUP.set(m.toLowerCase(), m);

export function resolveCultureNameMode(value: unknown): CultureNameMode | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface RegenerateAllCultureNamesCultureRef {
  i: number;
  name: string;
  base: number | null;
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateAllCultureNamesRuntime {
  list(): RegenerateAllCultureNamesCultureRef[];
  generate(
    mode: CultureNameMode,
    culture: RegenerateAllCultureNamesCultureRef,
  ): string;
  apply(i: number, name: string): void;
  redraw(): void;
}

interface NamesModule {
  getCultureShort?: (culture: number) => string;
  getBaseShort?: (base: number) => string;
}

export const defaultRegenerateAllCultureNamesRuntime: RegenerateAllCultureNamesRuntime =
  {
    list() {
      const cultures = getPackCollection<RawCulture>("cultures");
      if (!Array.isArray(cultures)) {
        throw new Error("pack.cultures is not available.");
      }
      const refs: RegenerateAllCultureNamesCultureRef[] = [];
      for (const culture of cultures) {
        if (!culture) continue;
        refs.push({
          i: culture.i,
          name: culture.name ?? "",
          base: typeof culture.base === "number" ? culture.base : null,
          lock: culture.lock,
          removed: culture.removed,
        });
      }
      return refs;
    },
    generate(mode, culture) {
      const names = getGlobal<NamesModule>("Names");
      if (!names) {
        throw new Error(
          "Names is not available yet; the map hasn't finished loading.",
        );
      }
      if (mode === "culture") {
        if (typeof names.getCultureShort !== "function") {
          throw new Error("Names.getCultureShort is not available.");
        }
        return names.getCultureShort(culture.i);
      }
      if (typeof names.getBaseShort !== "function") {
        throw new Error("Names.getBaseShort is not available.");
      }
      const nameBases = getGlobal<unknown[]>("nameBases");
      if (!Array.isArray(nameBases) || nameBases.length === 0) {
        throw new Error("nameBases is not available or empty.");
      }
      const baseIndex = Math.floor(Math.random() * nameBases.length);
      return names.getBaseShort(baseIndex);
    },
    apply(i, name) {
      const cultures = getPackCollection<RawCulture>("cultures");
      const culture = cultures?.[i];
      if (!culture) throw new Error(`Culture ${i} not found.`);
      if (culture.removed) throw new Error(`Culture ${i} has been removed.`);
      culture.name = name;
    },
    redraw() {
      getGlobal<() => void>("drawCultures")?.();
    },
  };

export function createRegenerateAllCultureNamesTool(
  runtime: RegenerateAllCultureNamesRuntime = defaultRegenerateAllCultureNamesRuntime,
): Tool {
  return {
    name: "regenerate_all_culture_names",
    description: `Bulk-regenerate names for every non-locked, non-removed culture (skips Wildlands, culture 0). The Cultures Editor has a per-culture name-regenerate button (\`cultureRegenerateName\` in public/modules/dynamic/editors/cultures-editor.js) but no built-in bulk button; this AI tool applies the same underlying Names algorithm across all active cultures. \`mode=culture\` (default, matches the editor's per-culture button) calls Names.getCultureShort(culture.i), which in turn delegates to Names.getBaseShort(culture.base). \`mode=random\` picks a random name-base per culture and calls Names.getBaseShort(base). Writes culture.name (does NOT touch culture.code — parallels the editor button which also leaves code untouched). Cultures have no on-map text labels (the renderer only fills region bodies), so no DOM text refresh is needed; drawCultures() is still called once at the end as a best-effort parity no-op. Cultures missing a namesbase (culture.base) are skipped with a "missing base" reason. Lock cultures first via \`set_entity_lock\` to preserve them. Reports \`renamed\` / \`skipped\` lists. Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...CULTURE_NAME_MODES],
          description: `"culture" (default, matches UI) or "random".`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { mode?: unknown };

      let mode: CultureNameMode = "culture";
      if (input.mode !== undefined && input.mode !== null) {
        const resolved = resolveCultureNameMode(input.mode);
        if (!resolved) {
          return errorResult(`Unknown mode: ${JSON.stringify(input.mode)}.`, {
            supported: [...CULTURE_NAME_MODES],
          });
        }
        mode = resolved;
      }

      let cultures: RegenerateAllCultureNamesCultureRef[];
      try {
        cultures = runtime.list();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const renamed: Array<{ i: number; previousName: string; name: string }> =
        [];
      const skipped: Array<{ i: number; name: string; reason: string }> = [];

      for (const culture of cultures) {
        if (culture.i <= 0) {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: "wildlands",
          });
          continue;
        }
        if (culture.removed) {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: "removed",
          });
          continue;
        }
        if (culture.lock) {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: "locked",
          });
          continue;
        }
        if (typeof culture.base !== "number") {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: "missing base",
          });
          continue;
        }

        let newName: string;
        try {
          newName = runtime.generate(mode, culture);
        } catch (err) {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: `generate failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
        if (typeof newName !== "string" || !newName.trim()) {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: "empty generator output",
          });
          continue;
        }

        try {
          runtime.apply(culture.i, newName);
        } catch (err) {
          skipped.push({
            i: culture.i,
            name: culture.name,
            reason: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        renamed.push({
          i: culture.i,
          previousName: culture.name,
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

export const regenerateAllCultureNamesTool =
  createRegenerateAllCultureNamesTool();
