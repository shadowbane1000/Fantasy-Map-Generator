import {
  createAliasResolver,
  errorResult,
  getGlobal,
  okResult,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type SaveMethod = "machine" | "storage";

export interface SaveMapRuntime {
  save(method: SaveMethod): Promise<void>;
}

const SAVE_TARGETS: readonly SaveMethod[] = ["machine", "storage"];

const resolveTarget = createAliasResolver<SaveMethod>(SAVE_TARGETS, {
  download: "machine",
  file: "machine",
  ".map": "machine",
  local_file: "machine",
  "local-file": "machine",
  browser: "storage",
  local: "storage",
  indexeddb: "storage",
  "local-storage": "storage",
  localstorage: "storage",
});

export function resolveSaveTarget(target: unknown): SaveMethod | null {
  if (target === undefined || target === null) return "machine";
  if (typeof target === "string" && !target.trim()) return "machine";
  return resolveTarget(target);
}

export const defaultSaveMapRuntime: SaveMapRuntime = {
  async save(method: SaveMethod): Promise<void> {
    const fn = getGlobal<(method: string) => Promise<void> | void>("saveMap");
    if (typeof fn !== "function") {
      throw new Error(
        "saveMap is not available yet; wait for the map to load.",
      );
    }
    await fn(method);
  },
};

export function createSaveMapTool(
  runtime: SaveMapRuntime = defaultSaveMapRuntime,
): Tool {
  return {
    name: "save_map",
    description:
      "Save the current map. Default 'download' triggers the browser to download a .map file (same as Ctrl+S in the UI). 'storage' persists the map to the browser's IndexedDB so it can be reloaded later from the Load menu.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Where to save: 'download' (alias 'machine', 'file') or 'storage' (alias 'browser', 'local'). Default 'download'.",
        },
      },
    },
    async execute(rawInput: unknown): Promise<ToolResult> {
      const input = (rawInput ?? {}) as { target?: unknown };
      const resolved = resolveSaveTarget(input.target);
      if (resolved === null) {
        return errorResult(
          `Unsupported target ${JSON.stringify(input.target)}. Use 'download' or 'storage'.`,
          { supported: ["download", "storage"] },
        );
      }

      try {
        await runtime.save(resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        target: resolved === "machine" ? "download" : "storage",
        canonical: resolved,
      });
    },
  };
}

export const saveMapTool = createSaveMapTool();
