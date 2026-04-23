import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const BURG_NAME_MODES = ["culture", "random"] as const;

export type BurgNameMode = (typeof BURG_NAME_MODES)[number];

const LOOKUP = new Map<string, BurgNameMode>();
for (const m of BURG_NAME_MODES) LOOKUP.set(m.toLowerCase(), m);

export function resolveBurgNameMode(value: unknown): BurgNameMode | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface RegenerateBurgNameRef {
  i: number;
  name: string;
  culture: number;
}

export interface RegenerateBurgNameRuntime {
  find(ref: number | string): RegenerateBurgNameRef | null;
  generate(mode: BurgNameMode, culture: number): string;
  apply(i: number, name: string): void;
}

interface NamesModule {
  getCulture?: (culture: number) => string;
  getBase?: (base: number) => string;
}

export const defaultRegenerateBurgNameRuntime: RegenerateBurgNameRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      culture: typeof entry.culture === "number" ? entry.culture : 0,
    };
  },
  generate(mode, culture) {
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
    const burgs = getPackCollection<RawBurg>("burgs");
    const burg = burgs?.[i];
    if (!burg) throw new Error(`Burg ${i} not found.`);
    burg.name = name;
    if (typeof document !== "undefined") {
      const label = document.getElementById(`burgLabel${i}`);
      if (label) label.textContent = name;
    }
  },
};

export function createRegenerateBurgNameTool(
  runtime: RegenerateBurgNameRuntime = defaultRegenerateBurgNameRuntime,
): Tool {
  return {
    name: "regenerate_burg_name",
    description: `Roll a fresh name for a burg — same side-effect as the Burg Editor's "regenerate name" buttons. Two modes: \`culture\` (default) draws from the burg's culture name-base via Names.getCulture; \`random\` picks a random name-base via Names.getBase. Writes burg.name and best-effort updates the #burgLabel{i} SVG text. Matches by burg id or case-insensitive name.`,
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or case-insensitive name.",
        },
        mode: {
          type: "string",
          enum: [...BURG_NAME_MODES],
          description: `"culture" (default) or "random".`,
        },
      },
      required: ["burg"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        mode?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

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

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      let newName: string;
      try {
        newName = runtime.generate(mode, current.culture);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (typeof newName !== "string" || !newName.trim()) {
        return errorResult("Name generator returned an empty string.");
      }

      try {
        runtime.apply(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        name: newName,
        mode,
      });
    },
  };
}

export const regenerateBurgNameTool = createRegenerateBurgNameTool();
