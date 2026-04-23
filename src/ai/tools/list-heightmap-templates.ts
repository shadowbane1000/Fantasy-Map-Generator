import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface HeightmapListEntry {
  id: number;
  name: string;
}

type HeightmapTypeFilter = "template" | "precreated";
const SUPPORTED_TYPES: HeightmapTypeFilter[] = ["template", "precreated"];

function resolveTypeFilter(raw: string): HeightmapTypeFilter | null {
  const v = raw.trim().toLowerCase();
  if (v === "template" || v === "templates") return "template";
  if (
    v === "precreated" ||
    v === "precreated-heightmaps" ||
    v === "precreated_heightmaps" ||
    v === "precreated heightmaps"
  ) {
    return "precreated";
  }
  return null;
}

function normalizeEntries(
  source: Record<string, unknown> | undefined,
): HeightmapListEntry[] {
  if (!source || typeof source !== "object") return [];
  const out: HeightmapListEntry[] = [];
  for (const value of Object.values(source)) {
    if (!value || typeof value !== "object") continue;
    const rec = value as { id?: unknown; name?: unknown };
    if (typeof rec.id !== "number" || !Number.isFinite(rec.id)) continue;
    if (typeof rec.name !== "string" || rec.name.length === 0) continue;
    out.push({ id: rec.id, name: rec.name });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

export function readHeightmapListFromGlobals(
  templates: Record<string, unknown> | undefined,
  precreated: Record<string, unknown> | undefined,
): { templates: HeightmapListEntry[]; precreated: HeightmapListEntry[] } {
  return {
    templates: normalizeEntries(templates),
    precreated: normalizeEntries(precreated),
  };
}

export interface HeightmapListRuntime {
  readTemplates(): Record<string, unknown> | undefined;
  readPrecreated(): Record<string, unknown> | undefined;
}

export const defaultHeightmapListRuntime: HeightmapListRuntime = {
  readTemplates(): Record<string, unknown> | undefined {
    return getGlobal<Record<string, unknown>>("heightmapTemplates");
  },
  readPrecreated(): Record<string, unknown> | undefined {
    return getGlobal<Record<string, unknown>>("precreatedHeightmaps");
  },
};

export function createListHeightmapTemplatesTool(
  runtime: HeightmapListRuntime = defaultHeightmapListRuntime,
): Tool {
  return {
    name: "list_heightmap_templates",
    description:
      "List every heightmap identifier the generator recognises. Two parallel lists are returned: `templates` (14 built-in procedural templates from public/config/heightmap-templates.js — Volcano, High Island, Low Island, Continents, Archipelago, Atoll, Mediterranean, Peninsula, Pangea, Isthmus, Shattered, Taklamakan, Old World, Fractious — whose canonical keys are the same ones `set_heightmap_template` accepts) and `precreated` (~23 fixed heightmaps from public/config/precreated-heightmaps.js — Africa Centric, Arabia, Eurasia, World, …). Each entry is `{id, name}`; lists are sorted by id ascending. Optional `type` filter: `template` returns only procedural templates, `precreated` returns only fixed maps; the opposite list is still present but empty to keep the response shape stable. Read-only. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Optional filter: 'template' for procedural templates only, 'precreated' for fixed heightmaps only. When omitted, both lists are returned.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown };
      let filter: HeightmapTypeFilter | null = null;
      if (input.type !== undefined && input.type !== null) {
        if (typeof input.type !== "string" || !input.type.trim()) {
          return errorResult("type must be a non-empty string.", {
            supported: [...SUPPORTED_TYPES],
          });
        }
        const resolved = resolveTypeFilter(input.type);
        if (!resolved) {
          return errorResult(`Unknown type: ${JSON.stringify(input.type)}.`, {
            supported: [...SUPPORTED_TYPES],
          });
        }
        filter = resolved;
      }

      const { templates, precreated } = readHeightmapListFromGlobals(
        runtime.readTemplates(),
        runtime.readPrecreated(),
      );

      const payload = {
        templates: filter === "precreated" ? [] : templates,
        precreated: filter === "template" ? [] : precreated,
      };
      return okResult(payload);
    },
  };
}

export const listHeightmapTemplatesTool = createListHeightmapTemplatesTool();
