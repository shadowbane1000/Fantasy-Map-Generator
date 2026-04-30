import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CellsDensityReadRuntime,
  createGetCellsDensityTool,
  defaultCellsDensityReadRuntime,
  getCellsDensityTool,
} from "./get-cells-density";

function runtimeOf(value: number | null): CellsDensityReadRuntime {
  return { read: () => value };
}

describe("get_cells_density tool", () => {
  it("returns the runtime value when present", async () => {
    const tool = createGetCellsDensityTool(runtimeOf(50000));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, value: 50000 });
  });

  it("returns null when runtime cannot resolve", async () => {
    const tool = createGetCellsDensityTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, value: null });
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetCellsDensityTool(runtimeOf(10000));
    const result = await tool.execute({ unused: true, another: "field" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).value).toBe(10000);
  });

  it("exposes the expected tool metadata", () => {
    expect(getCellsDensityTool.name).toBe("get_cells_density");
    const schema = getCellsDensityTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});

describe("defaultCellsDensityReadRuntime (integration)", () => {
  const getItem = vi.fn();
  const elements: Record<
    string,
    { value?: string; dataset?: { cells?: string } } | null
  > = {};
  const getElementById = vi.fn(
    (id: string) => (elements[id] as unknown) ?? null,
  );

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    getItem.mockReset();
    getElementById.mockClear();
    for (const k of Object.keys(elements)) delete elements[k];
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

  it("reads from pointsInput.dataset.cells when it is a supported count", () => {
    elements.pointsInput = {
      value: "8",
      dataset: { cells: "50000" },
    };
    expect(defaultCellsDensityReadRuntime.read()).toBe(50000);
  });

  it("falls back to pointsInput.value (level) when dataset is missing", () => {
    elements.pointsInput = {
      value: "4",
      dataset: {},
    };
    // level 4 -> 10000 cells
    expect(defaultCellsDensityReadRuntime.read()).toBe(10000);
  });

  it("falls back to localStorage 'points' (level) when DOM is missing", () => {
    getItem.mockImplementation((k: string) => (k === "points" ? "6" : null));
    // level 6 -> 30000
    expect(defaultCellsDensityReadRuntime.read()).toBe(30000);
  });

  it("returns null when no source has a usable value", () => {
    getItem.mockReturnValue(null);
    expect(defaultCellsDensityReadRuntime.read()).toBeNull();
  });

  it("prefers dataset.cells over value, and value over localStorage", () => {
    // dataset valid → wins
    elements.pointsInput = {
      value: "4", // would map to 10000
      dataset: { cells: "70000" },
    };
    getItem.mockImplementation((k: string) => (k === "points" ? "2" : null));
    expect(defaultCellsDensityReadRuntime.read()).toBe(70000);

    // dataset invalid → value wins
    elements.pointsInput = {
      value: "5",
      dataset: { cells: "abc" },
    };
    expect(defaultCellsDensityReadRuntime.read()).toBe(20000);

    // dataset + value missing → localStorage wins
    elements.pointsInput = {
      dataset: {},
    };
    getItem.mockImplementation((k: string) => (k === "points" ? "3" : null));
    expect(defaultCellsDensityReadRuntime.read()).toBe(5000);
  });

  it("ignores out-of-range / non-finite dataset values and falls through", () => {
    elements.pointsInput = {
      value: "7",
      dataset: { cells: "12345" }, // not a supported count
    };
    // dataset rejected → falls to value: level 7 → 40000
    expect(defaultCellsDensityReadRuntime.read()).toBe(40000);
  });

  it("ignores non-finite / non-integer level values from DOM and localStorage", () => {
    elements.pointsInput = {
      value: "NaN",
      dataset: {},
    };
    getItem.mockReturnValue("not-a-level");
    expect(defaultCellsDensityReadRuntime.read()).toBeNull();
  });

  it("ignores level values outside the 1-13 range", () => {
    elements.pointsInput = {
      value: "99",
      dataset: {},
    };
    getItem.mockImplementation((k: string) => (k === "points" ? "0" : null));
    expect(defaultCellsDensityReadRuntime.read()).toBeNull();
  });
});
