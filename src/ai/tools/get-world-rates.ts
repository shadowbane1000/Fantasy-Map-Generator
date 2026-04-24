import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { defaultWorldRatesRuntime, type WorldRates } from "./set-world-rates";

// Narrow runtime seam — read-only view of the world-rates surface. Mirrors
// the `read()` half of `WorldRatesRuntime` in `set-world-rates.ts`, so this
// tool doesn't pull in the write path it never uses.
export interface GetWorldRatesRuntime {
  read(): WorldRates;
}

// Default runtime delegates to `defaultWorldRatesRuntime.read()` — the same
// DOM-reading implementation `set_world_rates` uses when computing its
// `previous` snapshot. Keeps the two tools structurally aligned: whatever
// `set_world_rates` treats as "the current values" is what `get_world_rates`
// reports.
export const defaultGetWorldRatesRuntime: GetWorldRatesRuntime = {
  read(): WorldRates {
    return defaultWorldRatesRuntime.read();
  },
};

export function createGetWorldRatesTool(
  runtime: GetWorldRatesRuntime = defaultGetWorldRatesRuntime,
): Tool {
  return {
    name: "get_world_rates",
    description:
      `Read the current world-wide population scaling values shown by the ` +
      `Units Editor sliders — the read-side inverse of \`set_world_rates\`. ` +
      `Reports the three rates \`set_world_rates\` can write: ` +
      `\`populationRate\` (people per internal population unit, e.g. 1000), ` +
      `\`urbanization\` (urban-to-rural ratio, e.g. 1.0), and ` +
      `\`urbanDensity\` (people per cell of urban area, e.g. 10). Values ` +
      `are parsed from the same DOM inputs \`set_world_rates\` writes to ` +
      `(\`#populationRateInput\`, \`#urbanizationInput\`, ` +
      `\`#urbanDensityInput\`) — the authoritative source of truth in the ` +
      `live app, since \`set_world_rates\` dispatches a \`change\` event on ` +
      `those same inputs. Each field is a finite number when the input is ` +
      `present and parseable, or \`null\` when the input is missing / ` +
      `unparseable (e.g. during SSR / tests, or before the map has finished ` +
      `loading). Takes no parameters. Read-only — never mutates anything. ` +
      `Returns \`{ ok, populationRate, urbanization, urbanDensity }\`. ` +
      `Useful for checking current demographic scaling before adjusting it ` +
      `with \`set_world_rates\`, sanity-checking load-map state, or ` +
      `confirming previous \`set_world_rates\` writes landed. Requires an ` +
      `Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const rates = runtime.read();
      return okResult({
        populationRate: rates.populationRate,
        urbanization: rates.urbanization,
        urbanDensity: rates.urbanDensity,
      });
    },
  };
}

export const getWorldRatesTool = createGetWorldRatesTool();
