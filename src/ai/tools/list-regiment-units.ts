import { getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegimentUnit {
  id: string;
  name: string;
  type: string;
  rural: number;
  urban: number;
  crew: number;
  power: number;
  icon: string | null;
  separate: number;
}

export interface RegimentUnitsRuntime {
  readUnits(): RegimentUnit[] | null;
}

interface RawUnitLike {
  name?: unknown;
  type?: unknown;
  rural?: unknown;
  urban?: unknown;
  crew?: unknown;
  power?: unknown;
  icon?: unknown;
  separate?: unknown;
}

function toFiniteNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function normaliseUnit(raw: unknown): RegimentUnit | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as RawUnitLike;
  if (typeof entry.name !== "string") return null;
  const name = entry.name;
  if (!name) return null;
  const icon =
    typeof entry.icon === "string" && entry.icon.length > 0 ? entry.icon : null;
  const type = typeof entry.type === "string" ? entry.type : "";
  return {
    id: name,
    name,
    type,
    rural: toFiniteNumber(entry.rural),
    urban: toFiniteNumber(entry.urban),
    crew: toFiniteNumber(entry.crew),
    power: toFiniteNumber(entry.power),
    icon,
    separate: toFiniteNumber(entry.separate),
  };
}

function normaliseUnitList(items: unknown[]): RegimentUnit[] {
  const out: RegimentUnit[] = [];
  for (const raw of items) {
    const n = normaliseUnit(raw);
    if (n) out.push(n);
  }
  return out;
}

export const defaultRegimentUnitsRuntime: RegimentUnitsRuntime = {
  readUnits(): RegimentUnit[] | null {
    const options = getGlobal<{ military?: unknown }>("options");
    if (!options) return null;
    const military = options.military;
    if (!Array.isArray(military)) return null;
    return normaliseUnitList(military);
  },
};

export function createListRegimentUnitsTool(
  runtime: RegimentUnitsRuntime = defaultRegimentUnitsRuntime,
): Tool {
  return {
    name: "list_regiment_units",
    description: `List every military unit type configured in this map — the catalogue \`set_regiment_unit\` reads when it writes \`regiment.u[unit]\`. Source: \`window.options.military\`, the same array the Military Options dialog edits and \`MilitaryModule.generate\` iterates. Each entry reports \`{id, name, type, rural, urban, crew, power, icon, separate}\`: \`id\` and \`name\` are identical (the case-sensitive unit key — pass it verbatim to \`set_regiment_unit\`); \`type\` is the broad category ("melee", "ranged", "mounted", "machinery", "naval", "armored", "aviation", "magical", …); \`rural\` / \`urban\` are per-population recruitment ratios; \`crew\` is soldiers-per-unit; \`power\` is the combat weight; \`icon\` is the emoji/URL glyph (\`null\` when unset); \`separate\` is the 0/1 fleet-separation flag. Returns \`units\` in source order plus \`count\`. When \`options.military\` isn't initialised yet (fresh load before the first \`generate\`), returns \`{units: [], count: 0}\` rather than an error. Read-only — the discovery companion to \`set_regiment_unit\`. Takes no parameters. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const units = runtime.readUnits();
      if (units === null) return okResult({ units: [], count: 0 });
      return okResult({ units, count: units.length });
    },
  };
}

export const listRegimentUnitsTool = createListRegimentUnitsTool();
