import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CULTURE_SHIELDS } from "./set-culture-shield";

export interface EmblemShapeEntry {
  id: string;
  name: string;
}

export interface EmblemShapesListRuntime {
  readShapeIds(): readonly string[];
}

export const defaultEmblemShapesListRuntime: EmblemShapesListRuntime = {
  readShapeIds(): readonly string[] {
    return CULTURE_SHIELDS;
  },
};

function buildEntries(ids: readonly string[]): EmblemShapeEntry[] {
  return ids.map((id) => ({ id, name: id }));
}

export function createListEmblemShapesTool(
  runtime: EmblemShapesListRuntime = defaultEmblemShapesListRuntime,
): Tool {
  return {
    name: "list_emblem_shapes",
    description: `List every coat-of-arms shield shape id accepted by set_culture_shield, regenerate_burg_coa({shield}), regenerate_state_coa({shield}), regenerate_province_coa({shield}), and — together with the diversiform keys "culture" / "state" / "random" — set_default_emblem_shape. Source: the \`shields\` map in src/modules/emblem/shields.ts (groups basic/regional/historical/specific/banner/simple/fantasy/middleEarth, excluding the meta \`types\` key). Returns ~40 canonical shapes ("heater", "swiss", "wedged", "noldor", "round", "fantasy1", …) sorted ascending; pass \`id\` verbatim to the shape-accepting tools (case-insensitive). Each entry is \`{id, name}\`; \`name\` equals \`id\`. Also returns \`count\` = total entries. Takes no parameters. Read-only. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const ids = runtime.readShapeIds();
      const shapes = buildEntries(ids);
      return okResult({ shapes, count: shapes.length });
    },
  };
}

export const listEmblemShapesTool = createListEmblemShapesTool();
