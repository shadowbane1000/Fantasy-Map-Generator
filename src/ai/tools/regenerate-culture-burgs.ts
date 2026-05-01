import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  type RawBurg,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateCultureBurgsCultureRef {
  i: number;
  name: string;
  base: number | null;
  removed?: boolean;
}

export interface RegenerateCultureBurgsBurgRef {
  i: number;
  name: string;
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateCultureBurgsRuntime {
  findCulture(ref: number | string): RegenerateCultureBurgsCultureRef | null;
  hasNamesbase(base: number): boolean;
  listBurgsForCulture(cultureId: number): RegenerateCultureBurgsBurgRef[];
  generate(cultureId: number): string;
  apply(burgId: number, name: string): void;
}

interface NamesModule {
  getCulture?: (culture: number) => string;
}

function isWildlandsRef(ref: number | string): boolean {
  if (ref === 0) return true;
  if (typeof ref !== "string") return false;
  const key = ref.trim().toLowerCase();
  return key === "wildlands" || key === "0";
}

const RENAMED_CAP = 50;

export const defaultRegenerateCultureBurgsRuntime: RegenerateCultureBurgsRuntime =
  {
    findCulture(ref) {
      if (isWildlandsRef(ref)) {
        const wild = getPackCollection<RawCulture>("cultures")?.[0];
        if (!wild) return null;
        return {
          i: 0,
          name: wild.name ?? "Wildlands",
          base: typeof wild.base === "number" ? wild.base : null,
          removed: !!wild.removed,
        };
      }
      const entry = findEntityByRef(
        getPackCollection<RawCulture>("cultures"),
        ref,
      );
      if (!entry) return null;
      return {
        i: entry.i,
        name: entry.name ?? "",
        base: typeof entry.base === "number" ? entry.base : null,
        removed: !!entry.removed,
      };
    },
    hasNamesbase(base) {
      const bases = getGlobal<unknown[]>("nameBases");
      if (!Array.isArray(bases)) return false;
      if (base < 0 || base >= bases.length) return false;
      const entry = bases[base];
      return entry !== null && entry !== undefined;
    },
    listBurgsForCulture(cultureId) {
      const burgs = getPackCollection<RawBurg>("burgs");
      if (!Array.isArray(burgs)) {
        throw new Error(
          "window.pack.burgs is not available; the map hasn't finished loading.",
        );
      }
      const out: RegenerateCultureBurgsBurgRef[] = [];
      for (const burg of burgs) {
        if (!burg || !burg.i || burg.i <= 0) continue;
        if (burg.culture !== cultureId) continue;
        out.push({
          i: burg.i,
          name: burg.name ?? "",
          lock: !!burg.lock,
          removed: !!burg.removed,
        });
      }
      return out;
    },
    generate(cultureId) {
      const names = getGlobal<NamesModule>("Names");
      if (!names || typeof names.getCulture !== "function") {
        throw new Error(
          "Names.getCulture is not available; the map hasn't finished loading.",
        );
      }
      return names.getCulture(cultureId);
    },
    apply(burgId, name) {
      const burgs = getPackCollection<RawBurg>("burgs");
      const burg = burgs?.[burgId];
      if (!burg) throw new Error(`Burg ${burgId} not found.`);
      burg.name = name;
      if (typeof document !== "undefined") {
        const label = document.getElementById(`burgLabel${burgId}`);
        if (label) label.textContent = name;
      }
    },
  };

export function createRegenerateCultureBurgsTool(
  runtime: RegenerateCultureBurgsRuntime = defaultRegenerateCultureBurgsRuntime,
): Tool {
  return {
    name: "regenerate_culture_burgs",
    description: `Regenerate burg names for every non-removed, non-locked burg of a single culture — same side-effect as the Cultures Editor's per-culture "Regenerate burgs" button (\`cultureRegenerateBurgs\` in public/modules/dynamic/editors/cultures-editor.js). For each surviving burg of the resolved culture, calls Names.getCulture(culture.i) (which delegates to the culture's \`base\` namesbase) and writes burg.name. Best-effort updates the #burgLabel{i} SVG text. Refuses if \`nameBases[culture.base]\` is missing (mirrors the UI's tip-and-bail). Culture 0 (Wildlands) is accepted as a target — the editor row exposes the same button. Locked / removed burgs are counted but not touched. Use \`regenerate_burg_name\` for a single burg or \`regenerate_all_burg_names\` for every burg regardless of culture. The \`renamed\` array is capped at ${RENAMED_CAP} entries; \`renamed_count\` is always the true total. Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Culture id (>=0; 0 is Wildlands) or case-insensitive name.",
        },
      },
      required: ["culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { culture?: unknown };

      const cultureValid =
        (typeof input.culture === "number" &&
          Number.isInteger(input.culture) &&
          input.culture >= 0) ||
        (typeof input.culture === "string" && input.culture.trim());
      if (!cultureValid) {
        return errorResult(
          "culture must be a non-negative integer id or a non-empty name string.",
        );
      }

      const cultureRef = input.culture as number | string;

      const culture = runtime.findCulture(cultureRef);
      if (!culture) {
        return errorResult(`Culture ${JSON.stringify(cultureRef)} not found.`);
      }
      if (culture.removed) {
        return errorResult(
          `Cannot regenerate burgs for removed culture ${culture.i}.`,
        );
      }
      if (culture.base === null) {
        return errorResult(
          `Namesbase (unset) is not defined; cannot regenerate.`,
        );
      }
      if (!runtime.hasNamesbase(culture.base)) {
        return errorResult(
          `Namesbase ${culture.base} is not defined; cannot regenerate.`,
        );
      }

      let burgs: RegenerateCultureBurgsBurgRef[];
      try {
        burgs = runtime.listBurgsForCulture(culture.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let skippedLocked = 0;
      let skippedRemoved = 0;
      const active: RegenerateCultureBurgsBurgRef[] = [];
      for (const burg of burgs) {
        if (burg.removed === true) {
          skippedRemoved++;
          continue;
        }
        if (burg.lock === true) {
          skippedLocked++;
          continue;
        }
        active.push(burg);
      }

      const renamed: Array<{
        i: number;
        previous_name: string;
        name: string;
      }> = [];

      for (const burg of active) {
        let newName: string;
        try {
          newName = runtime.generate(culture.i);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        if (typeof newName !== "string" || !newName.trim()) {
          return errorResult("Name generator returned an empty string.");
        }
        try {
          runtime.apply(burg.i, newName);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        renamed.push({ i: burg.i, previous_name: burg.name, name: newName });
      }

      const truncated = renamed.length > RENAMED_CAP;
      const cappedRenamed = truncated ? renamed.slice(0, RENAMED_CAP) : renamed;

      return okResult({
        culture: { i: culture.i, name: culture.name },
        namesbase: culture.base,
        renamed_count: renamed.length,
        skipped_locked: skippedLocked,
        skipped_removed: skippedRemoved,
        renamed: cappedRenamed,
        ...(truncated ? { renamed_truncated: true } : {}),
      });
    },
  };
}

export const regenerateCultureBurgsTool = createRegenerateCultureBurgsTool();
