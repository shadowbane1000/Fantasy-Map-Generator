import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeIconsDensityRef,
  type BiomeIconsDensityRuntime,
  createSetBiomeIconsDensityTool,
  setBiomeIconsDensityTool,
} from "./set-biome-icons-density";

function makeRuntime(
  find: (ref: number | string) => BiomeIconsDensityRef | null,
): {
  runtime: BiomeIconsDensityRuntime;
  apply: ReturnType<typeof vi.fn<BiomeIconsDensityRuntime["apply"]>>;
} {
  const apply = vi.fn<BiomeIconsDensityRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_biome_icons_density tool", () => {
  it("sets density by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 3 ? { i: 3, name: "Savanna", previousDensity: 120 } : null,
    );
    const tool = createSetBiomeIconsDensityTool(runtime);
    const result = await tool.execute({ biome: 3, density: 200 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, 200);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Savanna",
      previousDensity: 120,
      density: 200,
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<BiomeIconsDensityRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "wetland"
        ? { i: 12, name: "Wetland", previousDensity: 250 }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBiomeIconsDensityTool(runtime);
    await tool.execute({ biome: "WETLAND", density: 100 });
    expect(find).toHaveBeenCalledWith("WETLAND");
    expect(apply).toHaveBeenCalledWith(12, 100);
  });

  it("accepts boundary values 0 and 1000", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDensity: 0,
    }));
    const tool = createSetBiomeIconsDensityTool(runtime);
    expect((await tool.execute({ biome: 1, density: 0 })).isError).toBeFalsy();
    expect(
      (await tool.execute({ biome: 1, density: 1000 })).isError,
    ).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeIconsDensityTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad, density: 10 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range / non-integer density", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDensity: 0,
    }));
    const tool = createSetBiomeIconsDensityTool(runtime);
    for (const bad of [
      -1,
      1001,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "10",
      null,
    ]) {
      const r = await tool.execute({ biome: 1, density: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeIconsDensityTool(runtime);
    const result = await tool.execute({ biome: 999, density: 10 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeIconsDensityRuntime = {
      find: () => ({ i: 1, name: "x", previousDensity: 0 }),
      apply: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createSetBiomeIconsDensityTool(runtime);
    const result = await tool.execute({ biome: 1, density: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("defaultBiomeIconsDensityRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;
  const originalDraw = (globalThis as { drawReliefIcons?: unknown })
    .drawReliefIcons;

  beforeEach(() => {
    (globalThis as unknown as { biomesData: unknown }).biomesData = {
      i: [0, 1, 2, 3],
      name: ["Marine", "Hot desert", "removed", "Savanna"],
      iconsDensity: [0, 3, 0, 120],
    };
    (globalThis as unknown as { drawReliefIcons: unknown }).drawReliefIcons =
      vi.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { biomesData: unknown }).biomesData =
      originalBiomes;
    (globalThis as unknown as { drawReliefIcons: unknown }).drawReliefIcons =
      originalDraw;
  });

  it("updates density at the correct slot", async () => {
    const result = await setBiomeIconsDensityTool.execute({
      biome: 1,
      density: 25,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: { iconsDensity: number[] } }
    ).biomesData;
    expect(biomesData.iconsDensity[1]).toBe(25);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Hot desert",
      previousDensity: 3,
      density: 25,
    });
  });

  it("calls drawReliefIcons best-effort", async () => {
    const draw = (globalThis as unknown as { drawReliefIcons: unknown })
      .drawReliefIcons as ReturnType<typeof vi.fn>;
    await setBiomeIconsDensityTool.execute({ biome: 1, density: 25 });
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("swallows drawReliefIcons throw (data still mutates)", async () => {
    (globalThis as unknown as { drawReliefIcons: unknown }).drawReliefIcons =
      vi.fn(() => {
        throw new Error("render failed");
      });
    const result = await setBiomeIconsDensityTool.execute({
      biome: 3,
      density: 80,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: { iconsDensity: number[] } }
    ).biomesData;
    expect(biomesData.iconsDensity[3]).toBe(80);
  });

  it("refuses to update a removed biome", async () => {
    const result = await setBiomeIconsDensityTool.execute({
      biome: 2,
      density: 10,
    });
    expect(result.isError).toBe(true);
    const biomesData = (
      globalThis as unknown as { biomesData: { iconsDensity: number[] } }
    ).biomesData;
    expect(biomesData.iconsDensity[2]).toBe(0);
  });

  it("finds by case-insensitive name", async () => {
    const result = await setBiomeIconsDensityTool.execute({
      biome: "savanna",
      density: 75,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: { iconsDensity: number[] } }
    ).biomesData;
    expect(biomesData.iconsDensity[3]).toBe(75);
  });

  it("errors when biomesData is missing entirely", async () => {
    (globalThis as unknown as { biomesData: unknown }).biomesData = undefined;
    const result = await setBiomeIconsDensityTool.execute({
      biome: 1,
      density: 10,
    });
    expect(result.isError).toBe(true);
  });
});
