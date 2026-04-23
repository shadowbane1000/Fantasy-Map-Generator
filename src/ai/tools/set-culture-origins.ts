import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface CultureOriginsRef {
  i: number;
  name: string;
  previousOrigins: number[];
  locked: boolean;
}

export interface CulturesInfo {
  length: number;
  removed: Set<number>;
}

export interface CultureOriginsRuntime {
  find(ref: number | string): CultureOriginsRef | null;
  getCulturesInfo(): CulturesInfo;
  apply(i: number, origins: number[]): void;
}

export const defaultCultureOriginsRuntime: CultureOriginsRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    const prev = Array.isArray(entry.origins)
      ? entry.origins.filter((n) => typeof n === "number")
      : [];
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousOrigins: [...prev],
      locked: !!entry.lock,
    };
  },
  getCulturesInfo() {
    const cultures = getPackCollection<RawCulture>("cultures");
    const removed = new Set<number>();
    if (Array.isArray(cultures)) {
      for (const c of cultures) {
        if (c?.removed && typeof c.i === "number") removed.add(c.i);
      }
      return { length: cultures.length, removed };
    }
    return { length: 0, removed };
  },
  apply(i: number, origins: number[]): void {
    const cultures = getPackCollection<RawCulture>("cultures");
    const culture = cultures?.[i];
    if (!culture) throw new Error(`Culture ${i} not found.`);
    if (culture.removed) throw new Error(`Culture ${i} has been removed.`);
    culture.origins = [...origins];
  },
};

function cleanOrigins(
  raw: unknown[],
  self: number,
  info: CulturesInfo,
): { ok: true; origins: number[] } | { ok: false; error: string } {
  const seen = new Set<number>();
  const cleaned: number[] = [];
  for (let idx = 0; idx < raw.length; idx++) {
    const value = raw[idx];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return {
        ok: false,
        error: `origins[${idx}] must be a non-negative integer culture id.`,
      };
    }
    if (value === self) {
      return {
        ok: false,
        error: `origins[${idx}] = ${value} is the culture itself; a culture cannot be its own parent.`,
      };
    }
    if (value >= info.length) {
      return {
        ok: false,
        error: `origins[${idx}] = ${value} is out of range (0 <= origin < ${info.length}).`,
      };
    }
    // Allow origin 0 (Wildlands) as the conventional "no parent" sentinel,
    // even though Wildlands is "removed" in the live pack.
    if (value !== 0 && info.removed.has(value)) {
      return {
        ok: false,
        error: `origins[${idx}] = ${value} refers to a removed culture.`,
      };
    }
    if (seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }
  return { ok: true, origins: cleaned };
}

export function createSetCultureOriginsTool(
  runtime: CultureOriginsRuntime = defaultCultureOriginsRuntime,
): Tool {
  return {
    name: "set_culture_origins",
    description:
      "Set a culture's heraldic parent chain (pack.cultures[i].origins) — the list of parent culture indices the Emblem / COA generator walks to mix ancestor traits into a child culture's coat of arms. Mirrors the Cultures Editor's origins column (see cultures-editor.js restoreOrigins and the remove-culture cascade). Pass `origins` as an array of existing, non-removed culture ids; an empty array is normalised to `[0]` (the 'no parent' sentinel used by cultures-generator.ts and remove_culture). Duplicates are deduplicated preserving first-occurrence order. Validates each origin is an integer within `pack.cultures` bounds, not the culture itself, and not tombstoned. Rejects culture 0 (Wildlands), removed, and locked cultures. Data-only mutation — regenerate emblems to see the new lineage reflected.",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (> 0) or case-insensitive current name.",
        },
        origins: {
          type: "array",
          items: { type: "integer" },
          description:
            "Array of parent culture ids (non-negative integers within pack.cultures bounds, not the culture itself, not removed). Empty array resets to [0] (no parent).",
        },
      },
      required: ["culture", "origins"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        culture?: unknown;
        origins?: unknown;
      };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);

      if (!Array.isArray(input.origins)) {
        return errorResult("origins must be an array of culture ids.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set origins on culture 0 (the Wildlands placeholder).",
        );
      }
      if (current.locked) {
        return errorResult(
          `Culture ${current.i} (${JSON.stringify(current.name)}) is locked. Unlock it first via set_entity_lock.`,
        );
      }

      const info = runtime.getCulturesInfo();
      if (info.length <= 0) {
        return errorResult(
          "pack.cultures is not available yet; wait for the map to finish loading.",
        );
      }

      const cleaned = cleanOrigins(input.origins, current.i, info);
      if (!cleaned.ok) return errorResult(cleaned.error);

      const origins = cleaned.origins.length ? cleaned.origins : [0];

      try {
        runtime.apply(current.i, origins);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousOrigins: current.previousOrigins,
        origins,
      });
    },
  };
}

export const setCultureOriginsTool = createSetCultureOriginsTool();
