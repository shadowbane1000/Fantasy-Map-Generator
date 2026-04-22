import { describe, expect, it, vi } from "vitest";
import {
  createSetWorldRatesTool,
  validateRatesInput,
  type WorldRates,
  type WorldRatesPatch,
  type WorldRatesRuntime,
} from "./set-world-rates";

function makeRuntime(
  previous: WorldRates = {
    populationRate: 1000,
    urbanization: 1,
    urbanDensity: 10,
  },
) {
  const read = vi.fn<WorldRatesRuntime["read"]>(() => previous);
  const write = vi.fn<WorldRatesRuntime["write"]>();
  const runtime: WorldRatesRuntime = { read, write };
  return { runtime, read, write };
}

describe("set_world_rates tool", () => {
  it("writes populationRate only", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    const result = await tool.execute({ population_rate: 2000 });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith({
      populationRate: 2000,
    } satisfies WorldRatesPatch);
    const body = JSON.parse(result.content);
    expect(body.previous.populationRate).toBe(1000);
    expect(body.current.populationRate).toBe(2000);
    expect(body.current.urbanization).toBe(1); // unchanged
  });

  it("writes urbanization only", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    await tool.execute({ urbanization: 1.3 });
    expect(write).toHaveBeenCalledWith({ urbanization: 1.3 });
  });

  it("writes urban_density only", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    await tool.execute({ urban_density: 10 });
    expect(write).toHaveBeenCalledWith({ urbanDensity: 10 });
  });

  it("writes multiple fields in one call", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    const result = await tool.execute({
      population_rate: 500,
      urbanization: 0.8,
      urban_density: 8,
    });
    expect(write).toHaveBeenCalledWith({
      populationRate: 500,
      urbanization: 0.8,
      urbanDensity: 8,
    });
    const body = JSON.parse(result.content);
    expect(body.current).toEqual({
      populationRate: 500,
      urbanization: 0.8,
      urbanDensity: 8,
    });
  });

  it("errors when no fields provided", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects invalid values per field", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    for (const bad of [
      { population_rate: 0 },
      { population_rate: -10 },
      { population_rate: Number.NaN },
      { population_rate: Number.POSITIVE_INFINITY },
      { population_rate: "1000" },
      { population_rate: 2_000_000 }, // out of range
      { urbanization: 1000 }, // > 100
      { urban_density: 0 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime();
    runtime.write = vi.fn(() => {
      throw new Error("#populationRateInput is not available yet");
    });
    const tool = createSetWorldRatesTool(runtime);
    const result = await tool.execute({ population_rate: 100 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("ignores null/undefined field values", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetWorldRatesTool(runtime);
    const result = await tool.execute({
      population_rate: 2000,
      urbanization: null,
      urban_density: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith({ populationRate: 2000 });
  });
});

describe("validateRatesInput", () => {
  it("accepts each valid field", () => {
    expect(validateRatesInput({ population_rate: 1500 })).toEqual({
      ok: true,
      patch: { populationRate: 1500 },
    });
    expect(validateRatesInput({ urbanization: 2.5 })).toEqual({
      ok: true,
      patch: { urbanization: 2.5 },
    });
    expect(validateRatesInput({ urban_density: 20 })).toEqual({
      ok: true,
      patch: { urbanDensity: 20 },
    });
  });

  const errOf = (r: ReturnType<typeof validateRatesInput>): string =>
    r.ok ? "" : r.error;

  it("rejects out-of-range and non-number values for each field", () => {
    expect(errOf(validateRatesInput({ population_rate: 0 }))).toMatch(
      /population_rate/,
    );
    expect(errOf(validateRatesInput({ urbanization: 200 }))).toMatch(
      /urbanization/,
    );
    expect(errOf(validateRatesInput({ urban_density: -1 }))).toMatch(
      /urban_density/,
    );
    expect(errOf(validateRatesInput({ population_rate: "x" }))).toMatch(
      /population_rate/,
    );
  });

  it("requires at least one field", () => {
    expect(errOf(validateRatesInput({}))).toMatch(/at least one/);
    expect(
      errOf(
        validateRatesInput({
          population_rate: null,
          urbanization: null,
        }),
      ),
    ).toMatch(/at least one/);
  });
});
