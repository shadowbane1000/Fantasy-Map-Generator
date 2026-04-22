import {
  createAliasResolver,
  errorResult,
  getGlobal,
  okResult,
  waitForWindowEvent,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type LoadSource = "storage" | "url";

export type LoadInstruction =
  | { source: "storage" }
  | { source: "url"; url: string };

export interface LoadMapRuntime {
  load(instruction: LoadInstruction): Promise<void> | void;
  waitForLoad(timeoutMs: number): Promise<void>;
}

export const DEFAULT_LOAD_TIMEOUT_MS = 60_000;

const LOAD_SOURCES: readonly LoadSource[] = ["storage", "url"];

const resolveSource = createAliasResolver<LoadSource>(LOAD_SOURCES, {
  browser: "storage",
  local: "storage",
  indexeddb: "storage",
  last: "storage",
  lastmap: "storage",
  "last-map": "storage",
  "last-saved": "storage",
  http: "url",
  https: "url",
  web: "url",
  link: "url",
  fetch: "url",
});

export function resolveLoadSource(source: unknown): LoadSource | null {
  return resolveSource(source);
}

export function isValidMapUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || v.length > 2000) return false;
  const m = v.match(/^https?:\/\/(.+)$/i);
  return !!m && (m[1] ?? "").trim().length > 0;
}

export const defaultLoadMapRuntime: LoadMapRuntime = {
  async load(instruction: LoadInstruction): Promise<void> {
    if (instruction.source === "storage") {
      const fn = getGlobal<() => Promise<void> | void>("quickLoad");
      if (typeof fn !== "function") {
        throw new Error(
          "quickLoad is not available yet; wait for the map to finish initial loading.",
        );
      }
      await fn();
      return;
    }
    const fn =
      getGlobal<(url: string, random?: boolean) => Promise<void> | void>(
        "loadMapFromURL",
      );
    if (typeof fn !== "function") {
      throw new Error(
        "loadMapFromURL is not available yet; wait for the map to finish initial loading.",
      );
    }
    await fn(instruction.url);
  },
  waitForLoad(timeoutMs: number): Promise<void> {
    return waitForWindowEvent("map:generated", timeoutMs);
  },
};

export function createLoadMapTool(
  runtime: LoadMapRuntime = defaultLoadMapRuntime,
  timeoutMs: number = DEFAULT_LOAD_TIMEOUT_MS,
): Tool {
  return {
    name: "load_map",
    description:
      "Load a saved map. `source: 'storage'` reloads the last map persisted to the browser (counterpart of save_map({target:'storage'})). `source: 'url'` downloads a .map file from an HTTP(S) URL. Waits for the new map to finish generating before returning.",
    input_schema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description:
            "Where to load from: 'storage' (alias 'browser', 'local', 'last') or 'url' (alias 'http', 'https', 'link').",
        },
        url: {
          type: "string",
          description:
            "HTTP(S) URL to a .map file. Required and only allowed when source is 'url'.",
        },
      },
      required: ["source"],
    },
    async execute(rawInput: unknown): Promise<ToolResult> {
      const input = (rawInput ?? {}) as {
        source?: unknown;
        url?: unknown;
      };

      const resolved = resolveLoadSource(input.source);
      if (resolved === null) {
        return errorResult(
          `Unsupported source ${JSON.stringify(input.source)}. Use 'storage' or 'url'.`,
          { supported: ["storage", "url"] },
        );
      }

      let instruction: LoadInstruction;
      if (resolved === "url") {
        if (!isValidMapUrl(input.url)) {
          return errorResult(
            "url must be a non-empty http:// or https:// string (other schemes are rejected for safety).",
          );
        }
        instruction = { source: "url", url: input.url.trim() };
      } else {
        instruction = { source: "storage" };
      }

      try {
        await runtime.load(instruction);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await runtime.waitForLoad(timeoutMs);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err), {
          triggered: true,
        });
      }

      return okResult({
        source: resolved,
        ...(instruction.source === "url" ? { url: instruction.url } : {}),
      });
    },
  };
}

export const loadMapTool = createLoadMapTool();
