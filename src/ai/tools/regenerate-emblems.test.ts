import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawProvince, RawState } from "./_shared";
import {
  createRegenerateEmblemsTool,
  type RegenerateEmblemsCounts,
  type RegenerateEmblemsRuntime,
  regenerateEmblemsTool,
} from "./regenerate-emblems";

function makeRuntime(
  counts: RegenerateEmblemsCounts = { states: 0, burgs: 0, provinces: 0 },
): {
  runtime: RegenerateEmblemsRuntime;
  regenerate: ReturnType<typeof vi.fn<RegenerateEmblemsRuntime["regenerate"]>>;
} {
  const regenerate = vi.fn<RegenerateEmblemsRuntime["regenerate"]>();
  return {
    runtime: { regenerate, counts: () => counts },
    regenerate,
  };
}

describe("regenerate_emblems tool", () => {
  it("calls regenerate and returns counts", async () => {
    const { runtime, regenerate } = makeRuntime({
      states: 5,
      burgs: 20,
      provinces: 15,
    });
    const tool = createRegenerateEmblemsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      states: 5,
      burgs: 20,
      provinces: 15,
    });
  });

  it("surfaces runtime errors", async () => {
    const runtime: RegenerateEmblemsRuntime = {
      regenerate: vi.fn(() => {
        throw new Error("regenerateEmblems is not available yet");
      }),
      counts: () => ({ states: 0, burgs: 0, provinces: 0 }),
    };
    const tool = createRegenerateEmblemsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/regenerateEmblems/);
  });
});

describe("defaultRegenerateEmblemsRuntime (integration)", () => {
  const regenerate = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRegenerate = (globalThis as { regenerateEmblems?: unknown })
    .regenerateEmblems;

  beforeEach(() => {
    regenerate.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria" },
        { i: 2, name: "Brighton" },
        { i: 3, name: "Gone", removed: true },
      ] satisfies RawState[],
      burgs: [
        { i: 0 },
        { i: 1, name: "Rookhold" },
        { i: 2, name: "Ashholm" },
        { i: 3, name: "Stormport" },
      ] satisfies RawBurg[],
      provinces: [
        { i: 0 },
        { i: 1, name: "North Mark" },
        { i: 2, name: "South Mark", removed: true },
      ] satisfies RawProvince[],
    };
    (globalThis as { regenerateEmblems?: unknown }).regenerateEmblems =
      regenerate;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { regenerateEmblems?: unknown }).regenerateEmblems =
      originalRegenerate;
  });

  it("delegates to globalThis.regenerateEmblems and reports active counts", async () => {
    const result = await regenerateEmblemsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      states: 2,
      burgs: 3,
      provinces: 1,
    });
  });

  it("errors when regenerateEmblems is not available", async () => {
    (globalThis as { regenerateEmblems?: unknown }).regenerateEmblems =
      undefined;
    const result = await regenerateEmblemsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/regenerateEmblems/);
  });
});
