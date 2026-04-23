import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  createRegenerateZonesTool,
  DEFAULT_ZONES_MULTIPLIER,
  type RegenerateZonesRuntime,
  regenerateZonesTool,
} from "./regenerate-zones";

function makeRuntime(activeCount = 3): {
  runtime: RegenerateZonesRuntime;
  regenerate: ReturnType<typeof vi.fn<RegenerateZonesRuntime["regenerate"]>>;
  countActive: ReturnType<typeof vi.fn<RegenerateZonesRuntime["countActive"]>>;
} {
  const regenerate = vi.fn<RegenerateZonesRuntime["regenerate"]>();
  const countActive = vi.fn<RegenerateZonesRuntime["countActive"]>(
    () => activeCount,
  );
  return { runtime: { regenerate, countActive }, regenerate, countActive };
}

describe("regenerate_zones tool", () => {
  it("delegates with provided multiplier", async () => {
    const { runtime, regenerate } = makeRuntime(5);
    const tool = createRegenerateZonesTool(runtime);
    const result = await tool.execute({ multiplier: 2 });
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith(2);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      multiplier: 2,
      zones: 5,
    });
  });

  it("defaults to 1 when multiplier omitted", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateZonesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith(DEFAULT_ZONES_MULTIPLIER);
  });

  it("rejects non-finite multiplier", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateZonesTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "2"]) {
      const r = await tool.execute({ multiplier: bad });
      expect(r.isError).toBe(true);
    }
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("rejects negative multiplier", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateZonesTool(runtime);
    const result = await tool.execute({ multiplier: -1 });
    expect(result.isError).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("rejects multiplier > 100", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateZonesTool(runtime);
    const result = await tool.execute({ multiplier: 101 });
    expect(result.isError).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RegenerateZonesRuntime = {
      regenerate: vi.fn(() => {
        throw new Error("Zones.generate is not available yet");
      }),
      countActive: () => 0,
    };
    const tool = createRegenerateZonesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Zones\.generate/);
  });
});

describe("defaultRegenerateZonesRuntime (integration)", () => {
  const zonesGenerate = vi.fn();
  const drawZones = vi.fn();
  const originalZones = (globalThis as { Zones?: unknown }).Zones;
  const originalDraw = (globalThis as { drawZones?: unknown }).drawZones;
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    zonesGenerate.mockReset();
    drawZones.mockReset();
    (globalThis as { Zones?: unknown }).Zones = { generate: zonesGenerate };
    (globalThis as { drawZones?: unknown }).drawZones = drawZones;
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        { i: 0 },
        { i: 1, name: "Plague" },
        { i: 2, name: "Famine" },
        { i: 3, name: "Gone", removed: true },
      ] satisfies RawZone[],
    };
  });

  afterEach(() => {
    (globalThis as { Zones?: unknown }).Zones = originalZones;
    (globalThis as { drawZones?: unknown }).drawZones = originalDraw;
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("calls Zones.generate and drawZones", async () => {
    const result = await regenerateZonesTool.execute({ multiplier: 2.5 });
    expect(result.isError).toBeFalsy();
    expect(zonesGenerate).toHaveBeenCalledWith(2.5);
    expect(drawZones).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      multiplier: 2.5,
      zones: 2,
    });
  });

  it("succeeds when drawZones is missing", async () => {
    (globalThis as { drawZones?: unknown }).drawZones = undefined;
    const result = await regenerateZonesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(zonesGenerate).toHaveBeenCalledWith(1);
  });

  it("errors when Zones.generate is not available", async () => {
    (globalThis as { Zones?: unknown }).Zones = undefined;
    const result = await regenerateZonesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Zones\.generate/);
  });
});
