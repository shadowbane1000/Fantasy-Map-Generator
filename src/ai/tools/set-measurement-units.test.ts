import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonDistance,
  canonHeight,
  canonTemperature,
  createSetMeasurementUnitsTool,
  type MeasurementUnitsRuntime,
  setMeasurementUnitsTool,
} from "./set-measurement-units";

function makeRuntime(): {
  runtime: MeasurementUnitsRuntime;
  setUnit: ReturnType<typeof vi.fn<MeasurementUnitsRuntime["setUnit"]>>;
} {
  const setUnit = vi.fn<MeasurementUnitsRuntime["setUnit"]>();
  return { runtime: { setUnit }, setUnit };
}

describe("canonicalizers", () => {
  it("canonDistance maps prose to canonical", () => {
    expect(canonDistance("miles")).toBe("mi");
    expect(canonDistance("KILOMETERS")).toBe("km");
    expect(canonDistance("league")).toBe("lg");
    expect(canonDistance("versta")).toBe("vr");
    expect(canonDistance("nautical mile")).toBe("nmi");
    expect(canonDistance("nautical league")).toBe("nlg");
  });

  it("canonDistance passes through unknown strings", () => {
    expect(canonDistance("custom-thing")).toBe("custom-thing");
    expect(canonDistance("  padded  ")).toBe("padded");
  });

  it("canonHeight maps prose", () => {
    expect(canonHeight("feet")).toBe("ft");
    expect(canonHeight("METERS")).toBe("m");
    expect(canonHeight("fathom")).toBe("f");
  });

  it("canonTemperature maps prose", () => {
    expect(canonTemperature("celsius")).toBe("°C");
    expect(canonTemperature("FAHRENHEIT")).toBe("°F");
    expect(canonTemperature("kelvin")).toBe("K");
    expect(canonTemperature("rankine")).toBe("°R");
    expect(canonTemperature("delisle")).toBe("°De");
    expect(canonTemperature("newton")).toBe("°N");
    expect(canonTemperature("réaumur")).toBe("°Ré");
    expect(canonTemperature("reaumur")).toBe("°Ré");
  });
});

describe("set_measurement_units tool", () => {
  it("sets distance alone", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    const result = await tool.execute({ distance: "miles" });
    expect(result.isError).toBeFalsy();
    expect(setUnit).toHaveBeenCalledTimes(1);
    expect(setUnit).toHaveBeenCalledWith(
      "distanceUnitInput",
      "distanceUnit",
      "mi",
    );
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      distance: "mi",
    });
  });

  it("sets all four together", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    const result = await tool.execute({
      distance: "km",
      area: "hectares",
      height: "meters",
      temperature: "celsius",
    });
    expect(result.isError).toBeFalsy();
    expect(setUnit).toHaveBeenCalledTimes(4);
    expect(setUnit.mock.calls).toEqual([
      ["distanceUnitInput", "distanceUnit", "km"],
      ["areaUnit", "areaUnit", "hectares"],
      ["heightUnit", "heightUnit", "m"],
      ["temperatureScale", "temperatureScale", "°C"],
    ]);
  });

  it("canonicalizes prose inputs", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    await tool.execute({
      distance: "MILES",
      height: "feet",
      temperature: "Fahrenheit",
    });
    expect(setUnit.mock.calls[0]?.[2]).toBe("mi");
    expect(setUnit.mock.calls[1]?.[2]).toBe("ft");
    expect(setUnit.mock.calls[2]?.[2]).toBe("°F");
  });

  it("keeps custom labels untouched", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    await tool.execute({ distance: "parsecs" });
    expect(setUnit).toHaveBeenCalledWith(
      "distanceUnitInput",
      "distanceUnit",
      "parsecs",
    );
  });

  it("accepts free-form area labels", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    await tool.execute({ area: "hectares" });
    expect(setUnit).toHaveBeenCalledWith("areaUnit", "areaUnit", "hectares");
  });

  it("errors when nothing is supplied", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(setUnit).not.toHaveBeenCalled();
  });

  it("rejects invalid types for each dimension", async () => {
    const { runtime, setUnit } = makeRuntime();
    const tool = createSetMeasurementUnitsTool(runtime);
    for (const bad of ["", "   ", 42, {}]) {
      expect((await tool.execute({ distance: bad })).isError).toBe(true);
      expect((await tool.execute({ area: bad })).isError).toBe(true);
      expect((await tool.execute({ height: bad })).isError).toBe(true);
      expect((await tool.execute({ temperature: bad })).isError).toBe(true);
    }
    expect(setUnit).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: MeasurementUnitsRuntime = {
      setUnit: vi.fn(() => {
        throw new Error("no document");
      }),
    };
    const tool = createSetMeasurementUnitsTool(runtime);
    const result = await tool.execute({ distance: "km" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no document/);
  });
});

describe("defaultMeasurementUnitsRuntime (integration)", () => {
  const setItem = vi.fn();
  const elements: Record<string, { value: string }> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    setItem.mockReset();
    getElementById.mockClear();
    elements.distanceUnitInput = { value: "mi" };
    elements.areaUnit = { value: "square" };
    elements.heightUnit = { value: "ft" };
    elements.temperatureScale = { value: "°C" };
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = { setItem };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage = originalStorage;
    for (const key of Object.keys(elements)) delete elements[key];
  });

  it("updates each element's value and calls localStorage.setItem", async () => {
    const result = await setMeasurementUnitsTool.execute({
      distance: "km",
      area: "hectares",
      height: "m",
      temperature: "°F",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.distanceUnitInput?.value).toBe("km");
    expect(elements.areaUnit?.value).toBe("hectares");
    expect(elements.heightUnit?.value).toBe("m");
    expect(elements.temperatureScale?.value).toBe("°F");
    expect(setItem.mock.calls).toEqual([
      ["distanceUnit", "km"],
      ["areaUnit", "hectares"],
      ["heightUnit", "m"],
      ["temperatureScale", "°F"],
    ]);
  });

  it("errors when the Options element is not mounted", async () => {
    delete elements.heightUnit;
    const result = await setMeasurementUnitsTool.execute({ height: "m" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/heightUnit/);
    expect(setItem).not.toHaveBeenCalled();
  });
});
