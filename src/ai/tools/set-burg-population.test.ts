import { describe, expect, it, vi } from "vitest";
import {
  type BurgPopulationRef,
  type BurgPopulationRuntime,
  createSetBurgPopulationTool,
  scaleDisplayToInternal,
  scaleInternalToDisplay,
} from "./set-burg-population";

function makeRuntime(
  resolver: (ref: number | string) => BurgPopulationRef | null,
) {
  const find = vi.fn(resolver);
  const setDisplayPopulation =
    vi.fn<BurgPopulationRuntime["setDisplayPopulation"]>();
  const runtime: BurgPopulationRuntime = { find, setDisplayPopulation };
  return { runtime, find, setDisplayPopulation };
}

describe("set_burg_population tool", () => {
  it("sets the population via the runtime using the display value", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Stormport", displayPopulation: 30000 } : null,
    );
    const tool = createSetBurgPopulationTool(runtime);
    const result = await tool.execute({ burg: 5, population: 50000 });
    expect(result.isError).toBeFalsy();
    expect(setDisplayPopulation).toHaveBeenCalledWith(5, 50000);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Stormport",
      previousPopulation: 30000,
      population: 50000,
    });
  });

  it("resolves a case-insensitive name", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime((ref) =>
      ref === "stormport"
        ? { i: 5, name: "Stormport", displayPopulation: 0 }
        : null,
    );
    const tool = createSetBurgPopulationTool(runtime);
    await tool.execute({ burg: "stormport", population: 1500 });
    expect(setDisplayPopulation).toHaveBeenCalledWith(5, 1500);
  });

  it("allows population of 0 (abandoned settlement)", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime(() => ({
      i: 1,
      name: "x",
      displayPopulation: 100,
    }));
    const tool = createSetBurgPopulationTool(runtime);
    const result = await tool.execute({ burg: 1, population: 0 });
    expect(result.isError).toBeFalsy();
    expect(setDisplayPopulation).toHaveBeenCalledWith(1, 0);
  });

  it("rejects burg 0 placeholder", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime(() => ({
      i: 0,
      name: "Placeholder",
      displayPopulation: 0,
    }));
    const tool = createSetBurgPopulationTool(runtime);
    const result = await tool.execute({ burg: 0, population: 1 });
    expect(result.isError).toBe(true);
    expect(setDisplayPopulation).not.toHaveBeenCalled();
  });

  it("errors for unknown refs", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime(() => null);
    const tool = createSetBurgPopulationTool(runtime);
    const result = await tool.execute({ burg: 999, population: 1 });
    expect(result.isError).toBe(true);
    expect(setDisplayPopulation).not.toHaveBeenCalled();
  });

  it("rejects invalid population values", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime(() => ({
      i: 1,
      name: "x",
      displayPopulation: 0,
    }));
    const tool = createSetBurgPopulationTool(runtime);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "100", {}]) {
      const r = await tool.execute({ burg: 1, population: bad });
      expect(r.isError).toBe(true);
    }
    expect(setDisplayPopulation).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, setDisplayPopulation } = makeRuntime(() => null);
    const tool = createSetBurgPopulationTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ burg: bad, population: 100 });
      expect(r.isError).toBe(true);
    }
    expect(setDisplayPopulation).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "x",
      displayPopulation: 0,
    }));
    runtime.setDisplayPopulation = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetBurgPopulationTool(runtime);
    const result = await tool.execute({ burg: 1, population: 100 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });
});

describe("scaleDisplayToInternal / scaleInternalToDisplay", () => {
  it("divides display by rate * urban and rounds to 4 decimals", () => {
    // 50000 / 1000 / 2 = 25 exactly
    expect(
      scaleDisplayToInternal(50000, { populationRate: 1000, urbanization: 2 }),
    ).toBe(25);
    // 30000 / 1000 / 2 = 15
    expect(
      scaleDisplayToInternal(30000, { populationRate: 1000, urbanization: 2 }),
    ).toBe(15);
    // 3 / 1000 / 2 = 0.0015 (stays under 4-decimal precision)
    expect(
      scaleDisplayToInternal(3, { populationRate: 1000, urbanization: 2 }),
    ).toBe(0.0015);
  });

  it("falls back to 1 when rates are non-positive", () => {
    expect(
      scaleDisplayToInternal(5000, { populationRate: 0, urbanization: 2 }),
    ).toBe(2500); // 5000 / 1 / 2
    expect(
      scaleDisplayToInternal(5000, {
        populationRate: Number.NaN,
        urbanization: Number.NaN,
      }),
    ).toBe(5000);
  });

  it("rounds display output to a non-negative integer", () => {
    expect(
      scaleInternalToDisplay(25, { populationRate: 1000, urbanization: 2 }),
    ).toBe(50000);
    expect(
      scaleInternalToDisplay(-1, { populationRate: 1000, urbanization: 2 }),
    ).toBe(0);
  });
});
