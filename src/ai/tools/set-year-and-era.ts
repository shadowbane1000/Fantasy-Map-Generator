import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface WorldDateState {
  year: number | null;
  era: string | null;
  eraShort: string | null;
}

export interface WorldDateRuntime {
  read(): WorldDateState | null;
  writeYear(year: number): void;
  writeEra(era: string, eraShort: string): void;
}

export function deriveEraShort(era: string): string {
  return era
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

interface WindowOptions {
  year?: number;
  era?: string;
  eraShort?: string;
}

export const defaultWorldDateRuntime: WorldDateRuntime = {
  read(): WorldDateState | null {
    const opts = getGlobal<WindowOptions>("options");
    if (!opts) return null;
    return {
      year: typeof opts.year === "number" ? opts.year : null,
      era: typeof opts.era === "string" ? opts.era : null,
      eraShort: typeof opts.eraShort === "string" ? opts.eraShort : null,
    };
  },
  writeYear(year: number): void {
    const opts = getGlobal<WindowOptions>("options");
    if (!opts) throw new Error("window.options is not available yet.");
    opts.year = year;
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "yearInput",
      ) as HTMLInputElement | null;
      if (el) el.value = String(year);
    }
  },
  writeEra(era: string, eraShort: string): void {
    const opts = getGlobal<WindowOptions>("options");
    if (!opts) throw new Error("window.options is not available yet.");
    opts.era = era;
    opts.eraShort = eraShort;
    if (typeof document !== "undefined") {
      const el = document.getElementById("eraInput") as HTMLInputElement | null;
      if (el) el.value = era;
    }
  },
};

interface Input {
  year?: unknown;
  era?: unknown;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseYear(value: unknown): ParseResult<number> {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value))
      return { ok: false, error: "year must be a finite integer." };
    return { ok: true, value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: "year must not be empty." };
    if (!/^-?\d+$/.test(trimmed))
      return {
        ok: false,
        error: "year must be an integer or an integer-valued string.",
      };
    return { ok: true, value: Number.parseInt(trimmed, 10) };
  }
  return {
    ok: false,
    error: "year must be an integer or an integer-valued string.",
  };
}

function parseEra(value: unknown): ParseResult<string> {
  if (typeof value !== "string")
    return { ok: false, error: "era must be a string." };
  const trimmed = value.trim();
  if (!trimmed)
    return { ok: false, error: "era must not be empty or whitespace only." };
  return { ok: true, value: trimmed };
}

export function createSetYearAndEraTool(
  runtime: WorldDateRuntime = defaultWorldDateRuntime,
): Tool {
  return {
    name: "set_year_and_era",
    description:
      "Set the world's in-fiction year and/or era (e.g. '1247 Second Age'). At least one of year or era must be provided. Updates window.options (year, era, eraShort) and the matching inputs in the Options panel. eraShort is auto-derived from era as uppercase initials (e.g. 'Second Age' -> 'SA').",
    input_schema: {
      type: "object",
      properties: {
        year: {
          type: ["integer", "string"],
          description:
            "The new in-fiction year as an integer or integer-valued string.",
        },
        era: {
          type: "string",
          description:
            "The new era name (e.g. 'Bright Era', 'Second Age'). Must be non-empty.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Input;
      const hasYear = input.year !== undefined && input.year !== null;
      const hasEra = input.era !== undefined && input.era !== null;

      if (!hasYear && !hasEra) {
        return errorResult("At least one of 'year' or 'era' must be provided.");
      }

      let parsedYear: number | null = null;
      if (hasYear) {
        const r = parseYear(input.year);
        if (!r.ok) return errorResult(r.error);
        parsedYear = r.value;
      }

      let parsedEra: string | null = null;
      let parsedEraShort: string | null = null;
      if (hasEra) {
        const r = parseEra(input.era);
        if (!r.ok) return errorResult(r.error);
        parsedEra = r.value;
        parsedEraShort = deriveEraShort(r.value);
      }

      const previous = runtime.read();
      if (!previous) {
        return errorResult("window.options is not available yet.");
      }

      try {
        if (parsedYear !== null) runtime.writeYear(parsedYear);
        if (parsedEra !== null && parsedEraShort !== null)
          runtime.writeEra(parsedEra, parsedEraShort);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const current: WorldDateState = {
        year: parsedYear !== null ? parsedYear : previous.year,
        era: parsedEra !== null ? parsedEra : previous.era,
        eraShort: parsedEraShort !== null ? parsedEraShort : previous.eraShort,
      };

      return okResult({ previous, current });
    },
  };
}

export const setYearAndEraTool = createSetYearAndEraTool();
