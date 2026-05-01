import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import {
  type AreaUnitRuntime,
  createSetAreaUnitTool,
  setAreaUnitTool,
} from "./set-area-unit";

interface RuntimeFixture {
  runtime: AreaUnitRuntime;
  state: { areaUnit: string | null; distanceUnit: string | null };
  getAreaUnit: ReturnType<typeof vi.fn>;
  setAreaUnit: ReturnType<typeof vi.fn>;
  getDistanceUnit: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  callOrder: string[];
}

function makeRuntime(
  initial: { areaUnit?: string | null; distanceUnit?: string | null } = {},
): RuntimeFixture {
  const state = {
    areaUnit: "areaUnit" in initial ? (initial.areaUnit ?? null) : "square",
    distanceUnit:
      "distanceUnit" in initial ? (initial.distanceUnit ?? null) : "mi",
  };
  const callOrder: string[] = [];
  const getAreaUnit = vi.fn(() => {
    callOrder.push("getAreaUnit");
    return state.areaUnit;
  });
  const setAreaUnit = vi.fn((value: string) => {
    callOrder.push("setAreaUnit");
    state.areaUnit = value;
  });
  const getDistanceUnit = vi.fn(() => {
    callOrder.push("getDistanceUnit");
    return state.distanceUnit;
  });
  const persist = vi.fn((_key: string, _value: string) => {
    callOrder.push("persist");
  });
  return {
    runtime: { getAreaUnit, setAreaUnit, getDistanceUnit, persist },
    state,
    getAreaUnit,
    setAreaUnit,
    getDistanceUnit,
    persist,
    callOrder,
  };
}

describe("set_area_unit tool", () => {
  it("sets a literal label and reports previous", async () => {
    const fx = makeRuntime({ areaUnit: "square", distanceUnit: "km" });
    const tool = createSetAreaUnitTool(fx.runtime);
    const result = await tool.execute({ unit: "ha" });
    expect(result.isError).toBeFalsy();
    expect(fx.state.areaUnit).toBe("ha");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous: "square",
      unit: "ha",
      interpreted_label: "ha",
    });
  });

  it("interprets 'square' against the current distance unit", async () => {
    const fx = makeRuntime({ areaUnit: "ha", distanceUnit: "km" });
    const tool = createSetAreaUnitTool(fx.runtime);
    const result = await tool.execute({ unit: "square" });
    expect(result.isError).toBeFalsy();
    expect(fx.state.areaUnit).toBe("square");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous: "ha",
      unit: "square",
      interpreted_label: "km²",
    });
  });

  it("captures previous BEFORE mutating", async () => {
    const fx = makeRuntime({ areaUnit: "square", distanceUnit: "mi" });
    const tool = createSetAreaUnitTool(fx.runtime);
    await tool.execute({ unit: "acre" });
    const idxGet = fx.callOrder.indexOf("getAreaUnit");
    const idxSet = fx.callOrder.indexOf("setAreaUnit");
    expect(idxGet).toBeGreaterThanOrEqual(0);
    expect(idxSet).toBeGreaterThan(idxGet);
  });

  it("errors on empty unit", async () => {
    const fx = makeRuntime();
    const tool = createSetAreaUnitTool(fx.runtime);
    const result = await tool.execute({ unit: "" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "unit must be a non-empty string.",
    );
    expect(fx.setAreaUnit).not.toHaveBeenCalled();
  });

  it("errors on whitespace-only unit", async () => {
    const fx = makeRuntime();
    const tool = createSetAreaUnitTool(fx.runtime);
    const result = await tool.execute({ unit: "   \t  " });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "unit must be a non-empty string.",
    );
    expect(fx.setAreaUnit).not.toHaveBeenCalled();
  });

  it("errors on missing unit", async () => {
    const fx = makeRuntime();
    const tool = createSetAreaUnitTool(fx.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "unit must be a non-empty string.",
    );
    expect(fx.setAreaUnit).not.toHaveBeenCalled();
  });

  it("errors on non-string unit", async () => {
    const fx = makeRuntime();
    const tool = createSetAreaUnitTool(fx.runtime);
    for (const bad of [42, null, {}, [], true]) {
      const result = await tool.execute({ unit: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toBe(
        "unit must be a non-empty string.",
      );
    }
    expect(fx.setAreaUnit).not.toHaveBeenCalled();
  });

  it("propagates runtime setAreaUnit errors", async () => {
    const runtime: AreaUnitRuntime = {
      getAreaUnit: () => "square",
      setAreaUnit: () => {
        throw new Error(
          "#areaUnit input is not available; the units editor is not in the DOM.",
        );
      },
      getDistanceUnit: () => "mi",
      persist: () => {},
    };
    const tool = createSetAreaUnitTool(runtime);
    const result = await tool.execute({ unit: "ha" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "#areaUnit input is not available; the units editor is not in the DOM.",
    );
  });

  it("calls persist with ('areaUnit', unit)", async () => {
    const fx = makeRuntime();
    const tool = createSetAreaUnitTool(fx.runtime);
    await tool.execute({ unit: "ha" });
    expect(fx.persist).toHaveBeenCalledWith("areaUnit", "ha");
  });

  it("'square' interpreted_label degrades gracefully when distance unit missing", async () => {
    const fx = makeRuntime({ areaUnit: "ha", distanceUnit: null });
    const tool = createSetAreaUnitTool(fx.runtime);
    const result = await tool.execute({ unit: "square" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).interpreted_label).toBe("²");
  });
});

describe("registry round-trip", () => {
  it("buildDefaultRegistry exposes set_area_unit", () => {
    const registry = buildDefaultRegistry();
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("set_area_unit");
  });
});

describe("defaultAreaUnitRuntime (integration)", () => {
  const setItem = vi.fn();
  const elements: Record<string, { value: string }> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    setItem.mockReset();
    getElementById.mockClear();
    elements.areaUnit = { value: "square" };
    elements.distanceUnitInput = { value: "km" };
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = { setItem };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage = originalStorage;
    for (const key of Object.keys(elements)) delete elements[key];
  });

  it("writes the DOM input value and persists to localStorage", async () => {
    const result = await setAreaUnitTool.execute({ unit: "ha" });
    expect(result.isError).toBeFalsy();
    expect(elements.areaUnit?.value).toBe("ha");
    expect(setItem).toHaveBeenCalledWith("areaUnit", "ha");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous: "square",
      unit: "ha",
      interpreted_label: "ha",
    });
  });

  it("interprets 'square' against the live distance input", async () => {
    elements.areaUnit = { value: "ha" };
    elements.distanceUnitInput = { value: "mi" };
    const result = await setAreaUnitTool.execute({ unit: "square" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).interpreted_label).toBe("mi²");
  });

  it("errors when #areaUnit is not mounted", async () => {
    delete elements.areaUnit;
    const result = await setAreaUnitTool.execute({ unit: "ha" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "#areaUnit input is not available; the units editor is not in the DOM.",
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not throw when localStorage is absent", async () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    const result = await setAreaUnitTool.execute({ unit: "ha" });
    expect(result.isError).toBeFalsy();
    expect(elements.areaUnit?.value).toBe("ha");
  });

  it("does not throw when localStorage.setItem throws (e.g. quota)", async () => {
    setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const result = await setAreaUnitTool.execute({ unit: "ha" });
    expect(result.isError).toBeFalsy();
    expect(elements.areaUnit?.value).toBe("ha");
  });
});
