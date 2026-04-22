import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIMATE_FIELDS,
  type ClimateField,
  type ClimateRuntime,
  createSetClimateTool,
  setClimateTool,
} from "./set-climate";

function makeRuntime(): {
  runtime: ClimateRuntime;
  apply: ReturnType<typeof vi.fn<ClimateRuntime["apply"]>>;
} {
  const apply = vi.fn<ClimateRuntime["apply"]>();
  return { runtime: { apply }, apply };
}

describe("set_climate tool", () => {
  it("sets temperature_equator alone", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetClimateTool(runtime);
    const result = await tool.execute({ temperature_equator: 30 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
    const [field, value] = apply.mock.calls[0] ?? [];
    expect((field as ClimateField).optionKey).toBe("temperatureEquator");
    expect(value).toBe(30);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      temperature_equator: 30,
    });
  });

  it("sets all four together", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetClimateTool(runtime);
    const result = await tool.execute({
      temperature_equator: 28,
      temperature_north_pole: -35,
      temperature_south_pole: -20,
      precipitation: 150,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(4);
    const body = JSON.parse(result.content);
    expect(body.temperature_equator).toBe(28);
    expect(body.temperature_north_pole).toBe(-35);
    expect(body.temperature_south_pole).toBe(-20);
    expect(body.precipitation).toBe(150);
  });

  it("errors when nothing is supplied", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetClimateTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-number / non-finite values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetClimateTool(runtime);
    for (const bad of ["10", null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect((await tool.execute({ temperature_equator: bad })).isError).toBe(
        true,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects values outside the per-field range", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetClimateTool(runtime);
    // Temperatures are [-50, 50]
    expect((await tool.execute({ temperature_equator: -51 })).isError).toBe(
      true,
    );
    expect((await tool.execute({ temperature_equator: 51 })).isError).toBe(
      true,
    );
    expect((await tool.execute({ temperature_north_pole: -51 })).isError).toBe(
      true,
    );
    // Precipitation is [0, 500]
    expect((await tool.execute({ precipitation: -1 })).isError).toBe(true);
    expect((await tool.execute({ precipitation: 501 })).isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts the boundary values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetClimateTool(runtime);
    const result = await tool.execute({
      temperature_equator: 50,
      temperature_north_pole: -50,
      precipitation: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("surfaces runtime failures", async () => {
    const runtime: ClimateRuntime = {
      apply: vi.fn(() => {
        throw new Error("options missing");
      }),
    };
    const tool = createSetClimateTool(runtime);
    const result = await tool.execute({ temperature_equator: 20 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/options missing/);
  });
});

describe("defaultClimateRuntime (integration)", () => {
  const setItem = vi.fn();
  const elements: Record<string, { value: string }> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalOptions = (globalThis as { options?: unknown }).options;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    setItem.mockReset();
    getElementById.mockClear();
    for (const id of [
      "temperatureEquatorInput",
      "temperatureEquatorOutput",
      "temperatureNorthPoleInput",
      "temperatureNorthPoleOutput",
      "temperatureSouthPoleInput",
      "temperatureSouthPoleOutput",
      "precInput",
      "precOutput",
    ]) {
      elements[id] = { value: "" };
    }
    (globalThis as { options?: unknown }).options = {};
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = { setItem };
  });

  afterEach(() => {
    (globalThis as { options?: unknown }).options = originalOptions;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage = originalStorage;
    for (const k of Object.keys(elements)) delete elements[k];
  });

  it("updates options, both elements, and localStorage for a temperature field", async () => {
    const result = await setClimateTool.execute({
      temperature_equator: 32,
    });
    expect(result.isError).toBeFalsy();
    const options = (globalThis as { options: { temperatureEquator?: number } })
      .options;
    expect(options.temperatureEquator).toBe(32);
    expect(elements.temperatureEquatorInput?.value).toBe("32");
    expect(elements.temperatureEquatorOutput?.value).toBe("32");
    expect(setItem).toHaveBeenCalledWith("temperatureEquator", "32");
  });

  it("precipitation updates DOM + localStorage without touching options", async () => {
    const result = await setClimateTool.execute({ precipitation: 180 });
    expect(result.isError).toBeFalsy();
    const options = (globalThis as { options: Record<string, unknown> })
      .options;
    expect(options.prec).toBeUndefined();
    expect(elements.precInput?.value).toBe("180");
    expect(elements.precOutput?.value).toBe("180");
    expect(setItem).toHaveBeenCalledWith("prec", "180");
  });

  it("errors when window.options is missing for a temperature field", async () => {
    (globalThis as { options?: unknown }).options = undefined;
    const result = await setClimateTool.execute({ temperature_equator: 20 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/options/);
  });

  it("exposes the CLIMATE_FIELDS config (no accidental renames)", () => {
    expect(CLIMATE_FIELDS.temperature_equator?.storedKey).toBe(
      "temperatureEquator",
    );
    expect(CLIMATE_FIELDS.precipitation?.optionKey).toBeNull();
  });
});
