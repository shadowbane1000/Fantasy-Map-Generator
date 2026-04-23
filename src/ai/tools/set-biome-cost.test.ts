import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeCostRef,
  type BiomeCostRuntime,
  createSetBiomeCostTool,
  setBiomeCostTool,
} from "./set-biome-cost";

function makeRuntime(find: (ref: number | string) => BiomeCostRef | null): {
  runtime: BiomeCostRuntime;
  apply: ReturnType<typeof vi.fn<BiomeCostRuntime["apply"]>>;
} {
  const apply = vi.fn<BiomeCostRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_biome_cost tool", () => {
  it("sets cost by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 1 ? { i: 1, name: "Hot desert", previousCost: 200 } : null,
    );
    const tool = createSetBiomeCostTool(runtime);
    const result = await tool.execute({ biome: 1, cost: 500 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 500);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Hot desert",
      previousCost: 200,
      cost: 500,
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<BiomeCostRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "grassland"
        ? { i: 4, name: "Grassland", previousCost: 50 }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBiomeCostTool(runtime);
    await tool.execute({ biome: "GRASSLAND", cost: 25 });
    expect(find).toHaveBeenCalledWith("GRASSLAND");
    expect(apply).toHaveBeenCalledWith(4, 25);
  });

  it("accepts boundary values 0 and 100000", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousCost: 0,
    }));
    const tool = createSetBiomeCostTool(runtime);
    expect((await tool.execute({ biome: 1, cost: 0 })).isError).toBeFalsy();
    expect(
      (await tool.execute({ biome: 1, cost: 100000 })).isError,
    ).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeCostTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad, cost: 10 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range / non-integer cost", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousCost: 0,
    }));
    const tool = createSetBiomeCostTool(runtime);
    for (const bad of [
      -1,
      100001,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "10",
      null,
    ]) {
      const r = await tool.execute({ biome: 1, cost: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeCostTool(runtime);
    const result = await tool.execute({ biome: 999, cost: 10 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeCostRuntime = {
      find: () => ({ i: 1, name: "x", previousCost: 0 }),
      apply: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createSetBiomeCostTool(runtime);
    const result = await tool.execute({ biome: 1, cost: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("defaultBiomeCostRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;

  beforeEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = {
      i: [0, 1, 2, 3],
      name: ["Marine", "Hot desert", "removed", "Savanna"],
      cost: [10, 200, 0, 60],
    };
  });

  afterEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomes;
  });

  it("updates cost at the correct slot", async () => {
    const result = await setBiomeCostTool.execute({
      biome: 1,
      cost: 500,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { cost: number[] } })
      .biomesData;
    expect(biomesData.cost[1]).toBe(500);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Hot desert",
      previousCost: 200,
      cost: 500,
    });
  });

  it("refuses to update a removed biome", async () => {
    const result = await setBiomeCostTool.execute({
      biome: 2,
      cost: 10,
    });
    expect(result.isError).toBe(true);
    const biomesData = (globalThis as { biomesData: { cost: number[] } })
      .biomesData;
    expect(biomesData.cost[2]).toBe(0);
  });

  it("finds by case-insensitive name", async () => {
    const result = await setBiomeCostTool.execute({
      biome: "savanna",
      cost: 75,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { cost: number[] } })
      .biomesData;
    expect(biomesData.cost[3]).toBe(75);
  });

  it("errors when biomesData is missing entirely", async () => {
    (globalThis as { biomesData?: unknown }).biomesData = undefined;
    const result = await setBiomeCostTool.execute({
      biome: 1,
      cost: 10,
    });
    expect(result.isError).toBe(true);
  });
});
