import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetHeightmapOptionsTool,
  HEIGHTMAP_OPTION_KEYS,
  type HeightmapOptionsRuntime,
  setHeightmapOptionsTool,
} from "./set-heightmap-options";

function makeRuntime(): {
  runtime: HeightmapOptionsRuntime;
  apply: ReturnType<typeof vi.fn<HeightmapOptionsRuntime["apply"]>>;
} {
  const apply = vi.fn<HeightmapOptionsRuntime["apply"]>();
  return { runtime: { apply }, apply };
}

describe("set_heightmap_options tool", () => {
  it("writes single bool field", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    const result = await tool.execute({ allow_erosion: false });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("allow_erosion", false);
  });

  it("writes single int field", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    await tool.execute({ resolve_depressions_steps: 100 });
    expect(apply).toHaveBeenCalledWith("resolve_depressions_steps", 100);
  });

  it("writes multiple fields", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    await tool.execute({
      allow_erosion: true,
      lake_elevation_limit: 40,
    });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects empty input", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-boolean allow_erosion", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    for (const bad of ["true", 1, 0]) {
      const r = await tool.execute({ allow_erosion: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-integer int fields", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    for (const bad of [1.5, "100", null]) {
      const r = await tool.execute({
        resolve_depressions_steps: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range int fields", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightmapOptionsTool(runtime);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ resolve_depressions_steps: -1 }, "negative"],
      [{ resolve_depressions_steps: 2000 }, "too large"],
      [{ lake_elevation_limit: -1 }, "negative"],
      [{ lake_elevation_limit: 100 }, "too large"],
    ];
    for (const [input] of cases) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: HeightmapOptionsRuntime = {
      apply: vi.fn(() => {
        throw new Error("document is not available");
      }),
    };
    const tool = createSetHeightmapOptionsTool(runtime);
    const result = await tool.execute({ allow_erosion: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("exposes HEIGHTMAP_OPTION_KEYS", () => {
    expect([...HEIGHTMAP_OPTION_KEYS]).toEqual([
      "allow_erosion",
      "resolve_depressions_steps",
      "lake_elevation_limit",
    ]);
  });
});

describe("defaultHeightmapOptionsRuntime (integration)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  const elements: Record<string, { value: string; checked?: boolean }> = {};
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(elements)) delete elements[k];
    for (const k of Object.keys(storage)) delete storage[k];
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        if (!elements[id]) elements[id] = { value: "" };
        return elements[id];
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
  });

  it("allow_erosion writes checkbox checked + localStorage", async () => {
    const result = await setHeightmapOptionsTool.execute({
      allow_erosion: false,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.allowErosion?.checked).toBe(false);
    expect(storage.allowErosion).toBe("false");
  });

  it("int fields write input + output + localStorage", async () => {
    const result = await setHeightmapOptionsTool.execute({
      resolve_depressions_steps: 400,
      lake_elevation_limit: 30,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.resolveDepressionsStepsInput?.value).toBe("400");
    expect(elements.resolveDepressionsStepsOutput?.value).toBe("400");
    expect(elements.lakeElevationLimitInput?.value).toBe("30");
    expect(elements.lakeElevationLimitOutput?.value).toBe("30");
    expect(storage.resolveDepressionsSteps).toBe("400");
    expect(storage.lakeElevationLimit).toBe("30");
  });
});
