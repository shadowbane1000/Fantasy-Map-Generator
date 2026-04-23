import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { STYLE_PRESETS } from "./set-style-preset";

const CUSTOM_PREFIX = "fmgStyle_";

export interface StylePresetEntry {
  id: string;
  name: string;
  builtin: boolean;
}

export interface StylePresetListRuntime {
  readCustomPresetIds(): string[];
}

function readKeysFromLocalStorage(): string[] {
  const ls = (
    globalThis as unknown as {
      localStorage?: {
        length: number;
        key(index: number): string | null;
      };
    }
  ).localStorage;
  if (!ls || typeof ls.key !== "function" || typeof ls.length !== "number") {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < ls.length; i += 1) {
    const k = ls.key(i);
    if (typeof k === "string" && k.startsWith(CUSTOM_PREFIX)) out.push(k);
  }
  return out;
}

export const defaultStylePresetListRuntime: StylePresetListRuntime = {
  readCustomPresetIds(): string[] {
    try {
      return readKeysFromLocalStorage();
    } catch {
      return [];
    }
  },
};

function buildEntries(customIds: string[]): StylePresetEntry[] {
  const builtins: StylePresetEntry[] = STYLE_PRESETS.map((id) => ({
    id,
    name: id,
    builtin: true,
  }));
  const customs: StylePresetEntry[] = [...customIds]
    .filter((k) => typeof k === "string" && k.startsWith(CUSTOM_PREFIX))
    .sort()
    .map((id) => ({
      id,
      name: id.slice(CUSTOM_PREFIX.length),
      builtin: false,
    }));
  return [...builtins, ...customs];
}

export function createListStylePresetsTool(
  runtime: StylePresetListRuntime = defaultStylePresetListRuntime,
): Tool {
  return {
    name: "list_style_presets",
    description: `List every style preset identifier accepted by set_style_preset — the discovery companion to that tool. Returns the 12 built-in themes (default, ancient, gloom, pale, light, watercolor, clean, atlas, darkSeas, cyberpunk, night, monochrome) plus any user-saved custom presets stored in localStorage under the fmgStyle_ prefix (same set the Options panel's Style Preset selector renders). Each entry is {id, name, builtin} — pass \`id\` verbatim to set_style_preset (built-in ids are case-insensitive; custom ids are exact). Built-ins come first in canonical order; customs follow sorted by id ascending. Also returns \`count\` = total entries. Takes no parameters. Read-only. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const customIds = runtime.readCustomPresetIds();
      const presets = buildEntries(customIds);
      return okResult({ presets, count: presets.length });
    },
  };
}

export const listStylePresetsTool = createListStylePresetsTool();
