import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeHabitabilityRef,
  type BiomeHabitabilityRuntime,
  createSetBiomeHabitabilityTool,
  setBiomeHabitabilityTool,
} from "./set-biome-habitability";

function makeRuntime(
  find: (ref: number | string) => BiomeHabitabilityRef | null,
): {
  runtime: BiomeHabitabilityRuntime;
  apply: ReturnType<typeof vi.fn<BiomeHabitabilityRuntime["apply"]>>;
} {
  const apply = vi.fn<BiomeHabitabilityRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_biome_habitability tool", () => {
  it("sets habitability by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 1 ? { i: 1, name: "Hot desert", previousHabitability: 4 } : null,
    );
    const tool = createSetBiomeHabitabilityTool(runtime);
    const result = await tool.execute({ biome: 1, habitability: 40 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 40);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Hot desert",
      previousHabitability: 4,
      habitability: 40,
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<BiomeHabitabilityRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "grassland"
        ? { i: 4, name: "Grassland", previousHabitability: 30 }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBiomeHabitabilityTool(runtime);
    await tool.execute({ biome: "GRASSLAND", habitability: 60 });
    expect(find).toHaveBeenCalledWith("GRASSLAND");
    expect(apply).toHaveBeenCalledWith(4, 60);
  });

  it("accepts boundary values 0 and 9999", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousHabitability: 0,
    }));
    const tool = createSetBiomeHabitabilityTool(runtime);
    expect(
      (await tool.execute({ biome: 1, habitability: 0 })).isError,
    ).toBeFalsy();
    expect(
      (await tool.execute({ biome: 1, habitability: 9999 })).isError,
    ).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeHabitabilityTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad, habitability: 10 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range / non-integer habitability", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousHabitability: 0,
    }));
    const tool = createSetBiomeHabitabilityTool(runtime);
    for (const bad of [
      -1,
      10000,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "10",
      null,
    ]) {
      const r = await tool.execute({ biome: 1, habitability: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeHabitabilityTool(runtime);
    const result = await tool.execute({ biome: 999, habitability: 10 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeHabitabilityRuntime = {
      find: () => ({ i: 1, name: "x", previousHabitability: 0 }),
      apply: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createSetBiomeHabitabilityTool(runtime);
    const result = await tool.execute({ biome: 1, habitability: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("defaultBiomeHabitabilityRuntime (integration)", () => {
  const recalc = vi.fn();
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;
  const originalRecalc = (globalThis as { recalculatePopulation?: unknown })
    .recalculatePopulation;

  beforeEach(() => {
    recalc.mockReset();
    (globalThis as { biomesData?: unknown }).biomesData = {
      i: [0, 1, 2, 3],
      name: ["Marine", "Hot desert", "removed", "Savanna"],
      habitability: [0, 4, 0, 22],
    };
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      recalc;
  });

  afterEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomes;
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      originalRecalc;
  });

  it("updates habitability and recalculates population", async () => {
    const result = await setBiomeHabitabilityTool.execute({
      biome: 1,
      habitability: 40,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as { biomesData: { habitability: number[] } }
    ).biomesData;
    expect(biomesData.habitability[1]).toBe(40);
    expect(recalc).toHaveBeenCalledTimes(1);
  });

  it("refuses to update a removed biome", async () => {
    const result = await setBiomeHabitabilityTool.execute({
      biome: 2,
      habitability: 10,
    });
    expect(result.isError).toBe(true);
    const biomesData = (
      globalThis as { biomesData: { habitability: number[] } }
    ).biomesData;
    expect(biomesData.habitability[2]).toBe(0);
    expect(recalc).not.toHaveBeenCalled();
  });

  it("succeeds when recalculatePopulation is undefined", async () => {
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      undefined;
    const result = await setBiomeHabitabilityTool.execute({
      biome: "savanna",
      habitability: 50,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as { biomesData: { habitability: number[] } }
    ).biomesData;
    expect(biomesData.habitability[3]).toBe(50);
  });
});
