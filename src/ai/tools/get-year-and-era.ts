import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  defaultWorldDateRuntime,
  type WorldDateState,
} from "./set-year-and-era";

// Narrow runtime seam — read-only view of the world-date surface. Mirrors
// the `read()` half of `WorldDateRuntime` in `set-year-and-era.ts`, so this
// tool doesn't pull in the write paths (`writeYear`, `writeEra`) it never
// uses.
export interface GetYearAndEraRuntime {
  read(): WorldDateState | null;
}

// Default runtime delegates to `defaultWorldDateRuntime.read()` — the same
// `window.options`-reading implementation `set_year_and_era` uses when
// computing its `previous` snapshot. Keeps the two tools structurally
// aligned: whatever `set_year_and_era` treats as "the current values" is
// what `get_year_and_era` reports.
export const defaultGetYearAndEraRuntime: GetYearAndEraRuntime = {
  read(): WorldDateState | null {
    return defaultWorldDateRuntime.read();
  },
};

export function createGetYearAndEraTool(
  runtime: GetYearAndEraRuntime = defaultGetYearAndEraRuntime,
): Tool {
  return {
    name: "get_year_and_era",
    description:
      `Read the current in-fiction world date shown in the Options panel — ` +
      `the read-side inverse of \`set_year_and_era\`. Reports the three ` +
      `fields \`set_year_and_era\` can write: \`year\` (integer, e.g. ` +
      `1247), \`era\` (string, e.g. "Second Age"), and \`era_short\` ` +
      `(uppercase initials of \`era\`, e.g. "SA"). Values are read from ` +
      `\`window.options.year\` / \`.era\` / \`.eraShort\` — the same ` +
      `surface \`set_year_and_era\` writes to (options first, DOM sync ` +
      `second). Each field is the stored value when present and the right ` +
      `type, or \`null\` when \`window.options\` itself is missing (e.g. ` +
      `SSR / tests, or before the map has finished loading) or the ` +
      `individual field is missing / wrong type. Takes no parameters. ` +
      `Read-only — never mutates \`options\`, the DOM, or anything else. ` +
      `Returns \`{ ok, year, era, era_short }\`. Useful for checking the ` +
      `current in-fiction date before changing it with \`set_year_and_era\`, ` +
      `sanity-checking load-map state, or confirming previous ` +
      `\`set_year_and_era\` writes landed. Requires an Anthropic API key ` +
      `(see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const state = runtime.read();
      if (!state) {
        return okResult({ year: null, era: null, era_short: null });
      }
      return okResult({
        year: state.year,
        era: state.era,
        era_short: state.eraShort,
      });
    },
  };
}

export const getYearAndEraTool = createGetYearAndEraTool();
