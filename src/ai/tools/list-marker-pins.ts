import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { MARKER_PIN_SHAPES } from "./set-marker-pin";

export interface MarkerPinEntry {
  id: string;
  name: string;
}

export interface MarkerPinListRuntime {
  readPinIds(): readonly string[];
}

export const defaultMarkerPinListRuntime: MarkerPinListRuntime = {
  readPinIds(): readonly string[] {
    return MARKER_PIN_SHAPES;
  },
};

function buildEntries(ids: readonly string[]): MarkerPinEntry[] {
  return ids.map((id) => ({ id, name: id }));
}

export function createListMarkerPinsTool(
  runtime: MarkerPinListRuntime = defaultMarkerPinListRuntime,
): Tool {
  return {
    name: "list_marker_pins",
    description: `List every marker pin shape identifier accepted by set_marker_pin — the discovery companion to that tool. Returns the 13 canonical shapes (bubble, pin, square, squarish, diamond, hex, hexy, shieldy, shield, pentagon, heptagon, circle, no) in the same order the Markers Editor's Pin Shape dropdown renders (public/modules/ui/markers-editor.js, with the default being "bubble" when marker.pin is unset). Each entry is {id, name} — pass \`id\` verbatim to set_marker_pin (case-insensitive). Also returns \`count\` = total entries. Takes no parameters. Read-only. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const ids = runtime.readPinIds();
      const pins = buildEntries(ids);
      return okResult({ pins, count: pins.length });
    },
  };
}

export const listMarkerPinsTool = createListMarkerPinsTool();
