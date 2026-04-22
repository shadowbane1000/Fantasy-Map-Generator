import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const setMapNameTool: Tool = {
  name: "set_map_name",
  description:
    "Rename the current fantasy map. Updates the Map name field in the Options panel, which also drives filenames for exports and the header label on the map.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The new map name. Must be a non-empty string.",
      },
    },
    required: ["name"],
  },
  execute(rawInput: unknown): ToolResult {
    const input = (rawInput ?? {}) as { name?: unknown };
    const raw = typeof input.name === "string" ? input.name : "";
    const name = raw.trim();
    if (!name) {
      return errorResult("Map name must be a non-empty string.");
    }

    const el = (
      typeof document !== "undefined"
        ? document.getElementById("mapName")
        : null
    ) as HTMLInputElement | null;
    if (!el) {
      return errorResult("Map name input (#mapName) not found in the DOM.");
    }

    el.value = name;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    return okResult({ name });
  },
};
