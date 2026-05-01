import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  AREA_UNIT_INPUT_ID,
  createRestoreDefaultUnitsTool,
  DEFAULT_UNITS,
  DISTANCE_SCALE_INPUT_ID,
  DISTANCE_UNIT_INPUT_ID,
  HEIGHT_EXPONENT_INPUT_ID,
  HEIGHT_UNIT_INPUT_ID,
  POPULATION_RATE_INPUT_ID,
  type RestoreDefaultUnitsRuntime,
  restoreDefaultUnitsTool,
  STORAGE_KEYS,
  TEMPERATURE_SCALE_INPUT_ID,
  URBAN_DENSITY_INPUT_ID,
  URBANIZATION_INPUT_ID,
} from "./restore-default-units";

interface MakeRuntimeOptions {
  getDom?: (id: string) => string | null;
  setDom?: (id: string, value: string) => void;
  getGlobal?: (name: string) => unknown;
  setGlobal?: (name: string, value: unknown) => void;
  removeStorage?: (key: string) => void;
  callIfPresent?: (name: string, ...args: unknown[]) => boolean;
}

interface MakeRuntimeFixture {
  runtime: RestoreDefaultUnitsRuntime;
  getDom: ReturnType<typeof vi.fn<(id: string) => string | null>>;
  setDom: ReturnType<typeof vi.fn<(id: string, value: string) => void>>;
  getGlobal: ReturnType<typeof vi.fn<(name: string) => unknown>>;
  setGlobal: ReturnType<typeof vi.fn<(name: string, value: unknown) => void>>;
  removeStorage: ReturnType<typeof vi.fn<(key: string) => void>>;
  callIfPresent: ReturnType<
    typeof vi.fn<(name: string, ...args: unknown[]) => boolean>
  >;
}

function makeRuntime(opts: MakeRuntimeOptions = {}): MakeRuntimeFixture {
  const getDom = vi.fn<(id: string) => string | null>(
    opts.getDom ?? (() => null),
  );
  const setDom = vi.fn<(id: string, value: string) => void>(
    opts.setDom ?? (() => {}),
  );
  const getGlobal = vi.fn<(name: string) => unknown>(
    opts.getGlobal ?? (() => undefined),
  );
  const setGlobal = vi.fn<(name: string, value: unknown) => void>(
    opts.setGlobal ?? (() => {}),
  );
  const removeStorage = vi.fn<(key: string) => void>(
    opts.removeStorage ?? (() => {}),
  );
  const callIfPresent = vi.fn<(name: string, ...args: unknown[]) => boolean>(
    opts.callIfPresent ?? (() => true),
  );
  return {
    runtime: {
      getDom,
      setDom,
      getGlobal,
      setGlobal,
      removeStorage,
      callIfPresent,
    },
    getDom,
    setDom,
    getGlobal,
    setGlobal,
    removeStorage,
    callIfPresent,
  };
}

describe("restore_default_units tool", () => {
  it("happy path: all 9 fields restored, previous reflects pre-call values", async () => {
    const domValues: Record<string, string> = {
      [DISTANCE_UNIT_INPUT_ID]: "mi",
      [HEIGHT_UNIT_INPUT_ID]: "ft",
      [TEMPERATURE_SCALE_INPUT_ID]: "°F",
      [AREA_UNIT_INPUT_ID]: "ha",
      [HEIGHT_EXPONENT_INPUT_ID]: "1.5",
    };
    const globalValues: Record<string, unknown> = {
      distanceScale: 5,
      populationRate: 1500,
      urbanization: 1.2,
      urbanDensity: 12,
    };
    const { runtime } = makeRuntime({
      getDom: (id) => (id in domValues ? (domValues[id] ?? null) : null),
      getGlobal: (name) =>
        name in globalValues ? globalValues[name] : undefined,
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.applied).toEqual({
      distanceScale: 3,
      distanceUnit: "km",
      heightUnit: "m",
      temperatureScale: "°C",
      areaUnit: "square",
      heightExponent: 1.8,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: 10,
    });
    expect(parsed.previous).toEqual({
      distanceScale: 5,
      distanceUnit: "mi",
      heightUnit: "ft",
      temperatureScale: "°F",
      areaUnit: "ha",
      heightExponent: 1.5,
      populationRate: 1500,
      urbanization: 1.2,
      urbanDensity: 12,
    });
  });

  it("global reassignment: globalThis-backed fields all routed through setGlobal", async () => {
    const { runtime, setGlobal } = makeRuntime();
    const tool = createRestoreDefaultUnitsTool(runtime);
    await tool.execute({});
    const calls = setGlobal.mock.calls.map(
      ([name, value]) => `${name}=${String(value)}`,
    );
    expect(calls).toContain("distanceScale=3");
    expect(calls).toContain("populationRate=1000");
    expect(calls).toContain("urbanization=1");
    expect(calls).toContain("urbanDensity=10");
    expect(setGlobal).toHaveBeenCalledTimes(4);
  });

  it("DOM input update: each input element's value set to default string", async () => {
    const { runtime, setDom } = makeRuntime();
    const tool = createRestoreDefaultUnitsTool(runtime);
    await tool.execute({});
    const expectedPairs: Array<[string, string]> = [
      [DISTANCE_SCALE_INPUT_ID, "3"],
      [DISTANCE_UNIT_INPUT_ID, "km"],
      [HEIGHT_UNIT_INPUT_ID, "m"],
      [TEMPERATURE_SCALE_INPUT_ID, "°C"],
      [AREA_UNIT_INPUT_ID, "square"],
      [HEIGHT_EXPONENT_INPUT_ID, "1.8"],
      [POPULATION_RATE_INPUT_ID, "1000"],
      [URBANIZATION_INPUT_ID, "1"],
      [URBAN_DENSITY_INPUT_ID, "10"],
    ];
    const actualPairs = setDom.mock.calls.map(
      ([id, value]) => [id, value] as [string, string],
    );
    for (const pair of expectedPairs) {
      expect(actualPairs).toContainEqual(pair);
    }
    expect(setDom).toHaveBeenCalledTimes(expectedPairs.length);
  });

  it("localStorage.removeItem called for each of the 8 keys", async () => {
    const { runtime, removeStorage } = makeRuntime();
    const tool = createRestoreDefaultUnitsTool(runtime);
    await tool.execute({});
    const keys = removeStorage.mock.calls.map(([k]) => k).sort();
    expect(keys).toEqual([...STORAGE_KEYS].sort());
    expect(removeStorage).toHaveBeenCalledTimes(8);
  });

  it("each side-effect callback called when present (in legacy order)", async () => {
    const { runtime, callIfPresent } = makeRuntime({
      callIfPresent: () => true,
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(callIfPresent.mock.calls).toEqual([
      ["unlock", "distanceScale"],
      ["calculateFriendlyGridSize"],
      ["calculateTemperatures"],
      ["renderScaleBar"],
    ]);
    const parsed = JSON.parse(result.content);
    expect(parsed.side_effects_run).toEqual([
      "unlock",
      "calculateFriendlyGridSize",
      "calculateTemperatures",
      "renderScaleBar",
    ]);
  });

  it("side-effect absent → omitted from side_effects_run", async () => {
    const { runtime } = makeRuntime({
      callIfPresent: (name: string) => name !== "unlock",
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).side_effects_run).toEqual([
      "calculateFriendlyGridSize",
      "calculateTemperatures",
      "renderScaleBar",
    ]);
  });

  it("side-effect throws (callIfPresent reports false) → omitted", async () => {
    const { runtime } = makeRuntime({
      callIfPresent: (name: string) => name !== "calculateTemperatures",
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).side_effects_run).toEqual([
      "unlock",
      "calculateFriendlyGridSize",
      "renderScaleBar",
    ]);
  });

  it("removeStorage throws → tool body's try/catch keeps going; no error result", async () => {
    const { runtime, removeStorage } = makeRuntime({
      removeStorage: () => {
        throw new Error("fail");
      },
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).applied).toEqual({
      distanceScale: 3,
      distanceUnit: "km",
      heightUnit: "m",
      temperatureScale: "°C",
      areaUnit: "square",
      heightExponent: 1.8,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: 10,
    });
    expect(removeStorage).toHaveBeenCalledTimes(8);
  });

  it("missing DOM element → previous null for that field; apply silently skips", async () => {
    const otherDom: Record<string, string> = {
      [DISTANCE_UNIT_INPUT_ID]: "mi",
      [TEMPERATURE_SCALE_INPUT_ID]: "°F",
      [AREA_UNIT_INPUT_ID]: "ha",
      [HEIGHT_EXPONENT_INPUT_ID]: "1.5",
    };
    const { runtime } = makeRuntime({
      getDom: (id) =>
        id === HEIGHT_UNIT_INPUT_ID ? null : (otherDom[id] ?? null),
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous.heightUnit).toBeNull();
    expect(parsed.previous.distanceUnit).toBe("mi");
    expect(parsed.previous.temperatureScale).toBe("°F");
    expect(parsed.previous.areaUnit).toBe("ha");
    expect(parsed.applied).toEqual({
      distanceScale: 3,
      distanceUnit: "km",
      heightUnit: "m",
      temperatureScale: "°C",
      areaUnit: "square",
      heightExponent: 1.8,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: 10,
    });
  });

  it("missing globalThis-backed value → previous is null for those fields", async () => {
    const { runtime } = makeRuntime({
      getGlobal: () => undefined,
    });
    const tool = createRestoreDefaultUnitsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous.distanceScale).toBeNull();
    expect(parsed.previous.populationRate).toBeNull();
    expect(parsed.previous.urbanization).toBeNull();
    expect(parsed.previous.urbanDensity).toBeNull();
  });

  it("previous values captured BEFORE mutation (load-bearing): all reads precede all writes", async () => {
    const { runtime, getDom, getGlobal, setDom, setGlobal } = makeRuntime();
    const tool = createRestoreDefaultUnitsTool(runtime);
    await tool.execute({});
    const allReads = [
      ...getDom.mock.invocationCallOrder,
      ...getGlobal.mock.invocationCallOrder,
    ];
    const allWrites = [
      ...setDom.mock.invocationCallOrder,
      ...setGlobal.mock.invocationCallOrder,
    ];
    expect(allReads.length).toBeGreaterThan(0);
    expect(allWrites.length).toBeGreaterThan(0);
    const lastRead = Math.max(...allReads);
    const firstWrite = Math.min(...allWrites);
    expect(lastRead).toBeLessThan(firstWrite);
  });

  it("exposes the expected tool name and empty-input schema, and round-trips through ToolRegistry", () => {
    const { runtime } = makeRuntime();
    const tool = createRestoreDefaultUnitsTool(runtime);
    expect(tool.name).toBe("restore_default_units");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(restoreDefaultUnitsTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "restore_default_units",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    const { runtime, setDom } = makeRuntime();
    const tool = createRestoreDefaultUnitsTool(runtime);
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
    }
    expect(setDom).toHaveBeenCalledTimes(36); // 9 inputs × 4 invocations
  });

  it("DEFAULT_UNITS exported and pinned via deep-equal", () => {
    expect(DEFAULT_UNITS).toEqual({
      distanceScale: 3,
      distanceUnit: "km",
      heightUnit: "m",
      temperatureScale: "°C",
      areaUnit: "square",
      heightExponent: 1.8,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: 10,
    });
  });
});

describe("defaultRestoreDefaultUnitsRuntime (integration)", () => {
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const originalDistanceScale = (globalThis as { distanceScale?: unknown })
    .distanceScale;
  const originalPopulationRate = (globalThis as { populationRate?: unknown })
    .populationRate;
  const originalUrbanization = (globalThis as { urbanization?: unknown })
    .urbanization;
  const originalUrbanDensity = (globalThis as { urbanDensity?: unknown })
    .urbanDensity;
  const originalUnlock = (globalThis as { unlock?: unknown }).unlock;
  const originalGridSize = (
    globalThis as { calculateFriendlyGridSize?: unknown }
  ).calculateFriendlyGridSize;
  const originalTemps = (globalThis as { calculateTemperatures?: unknown })
    .calculateTemperatures;
  const originalRenderScale = (globalThis as { renderScaleBar?: unknown })
    .renderScaleBar;

  function makeDocStub(values: Record<string, string | null>): {
    elements: Record<string, { value: string } | null>;
    document: { getElementById(id: string): { value: string } | null };
  } {
    const elements: Record<string, { value: string } | null> = {};
    for (const [id, v] of Object.entries(values)) {
      elements[id] = v === null ? null : { value: v };
    }
    return {
      elements,
      document: {
        getElementById(id: string) {
          return elements[id] ?? null;
        },
      },
    };
  }

  beforeEach(() => {
    // Reset to a known clean state per test.
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    (globalThis as { distanceScale?: unknown }).distanceScale = undefined;
    (globalThis as { populationRate?: unknown }).populationRate = undefined;
    (globalThis as { urbanization?: unknown }).urbanization = undefined;
    (globalThis as { urbanDensity?: unknown }).urbanDensity = undefined;
    (globalThis as { unlock?: unknown }).unlock = undefined;
    (
      globalThis as { calculateFriendlyGridSize?: unknown }
    ).calculateFriendlyGridSize = undefined;
    (globalThis as { calculateTemperatures?: unknown }).calculateTemperatures =
      undefined;
    (globalThis as { renderScaleBar?: unknown }).renderScaleBar = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
    (globalThis as { distanceScale?: unknown }).distanceScale =
      originalDistanceScale;
    (globalThis as { populationRate?: unknown }).populationRate =
      originalPopulationRate;
    (globalThis as { urbanization?: unknown }).urbanization =
      originalUrbanization;
    (globalThis as { urbanDensity?: unknown }).urbanDensity =
      originalUrbanDensity;
    (globalThis as { unlock?: unknown }).unlock = originalUnlock;
    (
      globalThis as { calculateFriendlyGridSize?: unknown }
    ).calculateFriendlyGridSize = originalGridSize;
    (globalThis as { calculateTemperatures?: unknown }).calculateTemperatures =
      originalTemps;
    (globalThis as { renderScaleBar?: unknown }).renderScaleBar =
      originalRenderScale;
  });

  it("end-to-end happy path: writes all DOM inputs, reassigns globals, clears storage, fires side-effects", async () => {
    const { elements, document } = makeDocStub({
      [DISTANCE_SCALE_INPUT_ID]: "5",
      [DISTANCE_UNIT_INPUT_ID]: "mi",
      [HEIGHT_UNIT_INPUT_ID]: "ft",
      [TEMPERATURE_SCALE_INPUT_ID]: "°F",
      [AREA_UNIT_INPUT_ID]: "ha",
      [HEIGHT_EXPONENT_INPUT_ID]: "1.5",
      [POPULATION_RATE_INPUT_ID]: "1500",
      [URBANIZATION_INPUT_ID]: "1.2",
      [URBAN_DENSITY_INPUT_ID]: "12",
    });
    const removeItem = vi.fn();
    (globalThis as { document?: unknown }).document = document;
    (globalThis as { localStorage?: unknown }).localStorage = { removeItem };
    (globalThis as { distanceScale?: unknown }).distanceScale = 5;
    (globalThis as { populationRate?: unknown }).populationRate = 1500;
    (globalThis as { urbanization?: unknown }).urbanization = 1.2;
    (globalThis as { urbanDensity?: unknown }).urbanDensity = 12;
    const unlock = vi.fn();
    const calculateFriendlyGridSize = vi.fn();
    const calculateTemperatures = vi.fn();
    const renderScaleBar = vi.fn();
    (globalThis as { unlock?: unknown }).unlock = unlock;
    (
      globalThis as { calculateFriendlyGridSize?: unknown }
    ).calculateFriendlyGridSize = calculateFriendlyGridSize;
    (globalThis as { calculateTemperatures?: unknown }).calculateTemperatures =
      calculateTemperatures;
    (globalThis as { renderScaleBar?: unknown }).renderScaleBar =
      renderScaleBar;

    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.applied).toEqual({
      distanceScale: 3,
      distanceUnit: "km",
      heightUnit: "m",
      temperatureScale: "°C",
      areaUnit: "square",
      heightExponent: 1.8,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: 10,
    });
    expect(parsed.previous).toEqual({
      distanceScale: 5,
      distanceUnit: "mi",
      heightUnit: "ft",
      temperatureScale: "°F",
      areaUnit: "ha",
      heightExponent: 1.5,
      populationRate: 1500,
      urbanization: 1.2,
      urbanDensity: 12,
    });

    // DOM inputs were overwritten.
    expect(elements[DISTANCE_SCALE_INPUT_ID]?.value).toBe("3");
    expect(elements[DISTANCE_UNIT_INPUT_ID]?.value).toBe("km");
    expect(elements[HEIGHT_UNIT_INPUT_ID]?.value).toBe("m");
    expect(elements[TEMPERATURE_SCALE_INPUT_ID]?.value).toBe("°C");
    expect(elements[AREA_UNIT_INPUT_ID]?.value).toBe("square");
    expect(elements[HEIGHT_EXPONENT_INPUT_ID]?.value).toBe("1.8");
    expect(elements[POPULATION_RATE_INPUT_ID]?.value).toBe("1000");
    expect(elements[URBANIZATION_INPUT_ID]?.value).toBe("1");
    expect(elements[URBAN_DENSITY_INPUT_ID]?.value).toBe("10");

    // Globals reassigned (load-bearing).
    expect((globalThis as { distanceScale?: unknown }).distanceScale).toBe(3);
    expect((globalThis as { populationRate?: unknown }).populationRate).toBe(
      1000,
    );
    expect((globalThis as { urbanization?: unknown }).urbanization).toBe(1);
    expect((globalThis as { urbanDensity?: unknown }).urbanDensity).toBe(10);

    // localStorage cleared.
    expect(removeItem).toHaveBeenCalledTimes(8);
    const removedKeys = removeItem.mock.calls.map((c) => c[0]).sort();
    expect(removedKeys).toEqual([...STORAGE_KEYS].sort());

    // Side-effects all fired.
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith("distanceScale");
    expect(calculateFriendlyGridSize).toHaveBeenCalledTimes(1);
    expect(calculateFriendlyGridSize).toHaveBeenCalledWith();
    expect(calculateTemperatures).toHaveBeenCalledTimes(1);
    expect(calculateTemperatures).toHaveBeenCalledWith();
    expect(renderScaleBar).toHaveBeenCalledTimes(1);
    expect(renderScaleBar).toHaveBeenCalledWith();

    expect(parsed.side_effects_run).toEqual([
      "unlock",
      "calculateFriendlyGridSize",
      "calculateTemperatures",
      "renderScaleBar",
    ]);
  });

  it("missing localStorage → no error", async () => {
    const { document } = makeDocStub({
      [DISTANCE_UNIT_INPUT_ID]: "mi",
    });
    (globalThis as { document?: unknown }).document = document;
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).applied.distanceScale).toBe(3);
  });

  it("localStorage.removeItem throws → no error", async () => {
    const { document } = makeDocStub({});
    (globalThis as { document?: unknown }).document = document;
    const removeItem = vi.fn(() => {
      throw new Error("oops");
    });
    (globalThis as { localStorage?: unknown }).localStorage = { removeItem };
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).applied.distanceScale).toBe(3);
    expect(removeItem).toHaveBeenCalledTimes(8);
  });

  it("missing side-effect callbacks → side_effects_run subset", async () => {
    const { document } = makeDocStub({});
    (globalThis as { document?: unknown }).document = document;
    // unlock and calculateFriendlyGridSize unset; the other two set.
    const calculateTemperatures = vi.fn();
    const renderScaleBar = vi.fn();
    (globalThis as { calculateTemperatures?: unknown }).calculateTemperatures =
      calculateTemperatures;
    (globalThis as { renderScaleBar?: unknown }).renderScaleBar =
      renderScaleBar;
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).side_effects_run).toEqual([
      "calculateTemperatures",
      "renderScaleBar",
    ]);
  });

  it("side-effect throws → omitted; tool still ok", async () => {
    const { document } = makeDocStub({});
    (globalThis as { document?: unknown }).document = document;
    const unlock = vi.fn();
    const calculateFriendlyGridSize = vi.fn();
    const renderScaleBar = vi.fn();
    (globalThis as { unlock?: unknown }).unlock = unlock;
    (
      globalThis as { calculateFriendlyGridSize?: unknown }
    ).calculateFriendlyGridSize = calculateFriendlyGridSize;
    (globalThis as { calculateTemperatures?: unknown }).calculateTemperatures =
      () => {
        throw new Error("boom");
      };
    (globalThis as { renderScaleBar?: unknown }).renderScaleBar =
      renderScaleBar;
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).side_effects_run).toEqual([
      "unlock",
      "calculateFriendlyGridSize",
      "renderScaleBar",
    ]);
  });

  it("missing DOM element → previous null for that field", async () => {
    const { document } = makeDocStub({
      [DISTANCE_UNIT_INPUT_ID]: "mi",
      [TEMPERATURE_SCALE_INPUT_ID]: "°F",
      [AREA_UNIT_INPUT_ID]: "ha",
      [HEIGHT_EXPONENT_INPUT_ID]: "1.5",
      [HEIGHT_UNIT_INPUT_ID]: null, // explicitly missing
    });
    (globalThis as { document?: unknown }).document = document;
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous.heightUnit).toBeNull();
    expect(parsed.previous.distanceUnit).toBe("mi");
  });

  it("no document global → previous null for DOM-backed fields; globals still snapshot", async () => {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { distanceScale?: unknown }).distanceScale = 5;
    (globalThis as { populationRate?: unknown }).populationRate = 1500;
    (globalThis as { urbanization?: unknown }).urbanization = 1.2;
    (globalThis as { urbanDensity?: unknown }).urbanDensity = 12;
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous.distanceUnit).toBeNull();
    expect(parsed.previous.heightUnit).toBeNull();
    expect(parsed.previous.temperatureScale).toBeNull();
    expect(parsed.previous.areaUnit).toBeNull();
    expect(parsed.previous.heightExponent).toBeNull();
    expect(parsed.previous.distanceScale).toBe(5);
    expect(parsed.previous.populationRate).toBe(1500);
    expect(parsed.previous.urbanization).toBe(1.2);
    expect(parsed.previous.urbanDensity).toBe(12);
    expect(parsed.applied.distanceScale).toBe(3);
  });

  it("no globalThis-backed values → previous null for those fields; reassignment still writes", async () => {
    const { document } = makeDocStub({});
    (globalThis as { document?: unknown }).document = document;
    (globalThis as { distanceScale?: unknown }).distanceScale = undefined;
    (globalThis as { populationRate?: unknown }).populationRate = undefined;
    (globalThis as { urbanization?: unknown }).urbanization = undefined;
    (globalThis as { urbanDensity?: unknown }).urbanDensity = undefined;
    const result = await restoreDefaultUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous.distanceScale).toBeNull();
    expect(parsed.previous.populationRate).toBeNull();
    expect(parsed.previous.urbanization).toBeNull();
    expect(parsed.previous.urbanDensity).toBeNull();
    // Reassignment still writes.
    expect((globalThis as { distanceScale?: unknown }).distanceScale).toBe(3);
    expect((globalThis as { populationRate?: unknown }).populationRate).toBe(
      1000,
    );
    expect((globalThis as { urbanization?: unknown }).urbanization).toBe(1);
    expect((globalThis as { urbanDensity?: unknown }).urbanDensity).toBe(10);
  });
});
