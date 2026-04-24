import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetMeasurementUnitsTool,
  getMeasurementUnitsTool,
  type MeasurementUnitsReadRuntime,
} from "./get-measurement-units";

function makeRuntime(values: Record<string, string | null> = {}): {
  runtime: MeasurementUnitsReadRuntime;
  readUnit: ReturnType<typeof vi.fn>;
} {
  const readUnit = vi.fn(
    (elementId: string, _storedKey: string) => values[elementId] ?? null,
  );
  return { runtime: { readUnit }, readUnit };
}

describe("get_measurement_units tool", () => {
  it("returns all four units from the runtime", async () => {
    const { runtime, readUnit } = makeRuntime({
      distanceUnitInput: "km",
      areaUnit: "hectares",
      heightUnit: "m",
      temperatureScale: "°C",
    });
    const tool = createGetMeasurementUnitsTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: "km",
        area: "hectares",
        height: "m",
        temperature: "°C",
      },
    });
    expect(readUnit).toHaveBeenCalledTimes(4);
    expect(readUnit.mock.calls).toEqual([
      ["distanceUnitInput", "distanceUnit"],
      ["areaUnit", "areaUnit"],
      ["heightUnit", "heightUnit"],
      ["temperatureScale", "temperatureScale"],
    ]);
  });

  it("reports null for any missing unit", async () => {
    const { runtime } = makeRuntime({
      distanceUnitInput: "mi",
      heightUnit: "ft",
    });
    const tool = createGetMeasurementUnitsTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: "mi",
        area: null,
        height: "ft",
        temperature: null,
      },
    });
  });

  it("reports null for every unit when the runtime returns nothing", async () => {
    const { runtime } = makeRuntime();
    const tool = createGetMeasurementUnitsTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: null,
        area: null,
        height: null,
        temperature: null,
      },
    });
  });

  it("ignores any provided input (takes no args)", async () => {
    const { runtime } = makeRuntime({ distanceUnitInput: "km" });
    const tool = createGetMeasurementUnitsTool(runtime);
    const result = await tool.execute({ unused: true });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).units.distance).toBe("km");
  });

  it("tolerates null / undefined input", async () => {
    const { runtime } = makeRuntime({ areaUnit: "square" });
    const tool = createGetMeasurementUnitsTool(runtime);
    const a = await tool.execute(null);
    const b = await tool.execute(undefined);
    expect(a.isError).toBeFalsy();
    expect(b.isError).toBeFalsy();
    expect(JSON.parse(a.content).units.area).toBe("square");
    expect(JSON.parse(b.content).units.area).toBe("square");
  });

  it("exposes the expected tool name and schema", () => {
    expect(getMeasurementUnitsTool.name).toBe("get_measurement_units");
    const required = getMeasurementUnitsTool.input_schema.required;
    expect(required === undefined || required.length === 0).toBe(true);
    const props = getMeasurementUnitsTool.input_schema.properties ?? {};
    expect(Object.keys(props)).toEqual([]);
  });
});

describe("defaultMeasurementUnitsReadRuntime (integration)", () => {
  const getItem = vi.fn();
  const elements: Record<string, { value: string }> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;
  const originalStorage = (globalThis as unknown as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    getItem.mockReset();
    getElementById.mockClear();
    for (const key of Object.keys(elements)) delete elements[key];
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      getItem,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalStorage;
  });

  it("prefers the DOM input's current value over localStorage", async () => {
    elements.distanceUnitInput = { value: "km" };
    elements.areaUnit = { value: "square" };
    elements.heightUnit = { value: "m" };
    elements.temperatureScale = { value: "°C" };
    getItem.mockImplementation(() => "SHOULD_NOT_BE_USED");

    const result = await getMeasurementUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: "km",
        area: "square",
        height: "m",
        temperature: "°C",
      },
    });
    expect(getItem).not.toHaveBeenCalled();
  });

  it("falls back to localStorage when the DOM element is missing", async () => {
    // No elements mounted — getElementById returns null.
    getItem.mockImplementation((key: string) => {
      if (key === "distanceUnit") return "mi";
      if (key === "heightUnit") return "ft";
      return null;
    });

    const result = await getMeasurementUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: "mi",
        area: null,
        height: "ft",
        temperature: null,
      },
    });
    expect(getItem).toHaveBeenCalledWith("distanceUnit");
    expect(getItem).toHaveBeenCalledWith("areaUnit");
    expect(getItem).toHaveBeenCalledWith("heightUnit");
    expect(getItem).toHaveBeenCalledWith("temperatureScale");
  });

  it("falls back to localStorage when the DOM input's value is empty", async () => {
    elements.distanceUnitInput = { value: "" };
    getItem.mockImplementation((key: string) =>
      key === "distanceUnit" ? "nmi" : null,
    );

    const result = await getMeasurementUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).units.distance).toBe("nmi");
  });

  it("returns null for every unit when neither DOM nor storage has a value", async () => {
    getItem.mockImplementation(() => null);

    const result = await getMeasurementUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: null,
        area: null,
        height: null,
        temperature: null,
      },
    });
  });

  it("handles an undefined document (SSR / node)", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    getItem.mockImplementation((key: string) =>
      key === "heightUnit" ? "m" : null,
    );

    const result = await getMeasurementUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).units.height).toBe("m");
    expect(getElementById).not.toHaveBeenCalled();
  });

  it("handles an undefined localStorage (SSR / node)", async () => {
    elements.temperatureScale = { value: "°F" };
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      undefined;

    const result = await getMeasurementUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      units: {
        distance: null,
        area: null,
        height: null,
        temperature: "°F",
      },
    });
    expect(getItem).not.toHaveBeenCalled();
  });
});
