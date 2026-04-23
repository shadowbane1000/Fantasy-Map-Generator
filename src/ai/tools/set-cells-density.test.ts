import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CELLS_DENSITY_MAP,
  CELLS_DENSITY_OPTIONS,
  type CellsDensityRuntime,
  createSetCellsDensityTool,
  resolveCellsLevel,
  setCellsDensityTool,
} from "./set-cells-density";

describe("resolveCellsLevel", () => {
  it("returns level for each supported cell count", () => {
    for (const [level, count] of Object.entries(CELLS_DENSITY_MAP)) {
      expect(resolveCellsLevel(count)).toBe(Number(level));
    }
  });

  it("returns null for unsupported values", () => {
    expect(resolveCellsLevel(15000)).toBeNull();
    expect(resolveCellsLevel(0)).toBeNull();
    expect(resolveCellsLevel("10000")).toBeNull();
    expect(resolveCellsLevel(null)).toBeNull();
  });
});

describe("CELLS_DENSITY_OPTIONS", () => {
  it("has 13 entries sorted ascending", () => {
    expect(CELLS_DENSITY_OPTIONS).toHaveLength(13);
    const arr = [...CELLS_DENSITY_OPTIONS];
    for (let i = 1; i < arr.length; i++) {
      expect(arr[i] as number).toBeGreaterThan(arr[i - 1] as number);
    }
  });
});

function makeRuntime(currentRead: ReturnType<CellsDensityRuntime["read"]>): {
  runtime: CellsDensityRuntime;
  apply: ReturnType<typeof vi.fn<CellsDensityRuntime["apply"]>>;
} {
  const apply = vi.fn<CellsDensityRuntime["apply"]>();
  return {
    runtime: { read: () => currentRead, apply },
    apply,
  };
}

describe("set_cells_density tool", () => {
  it("delegates with correct level", async () => {
    const { runtime, apply } = makeRuntime(10000);
    const tool = createSetCellsDensityTool(runtime);
    const result = await tool.execute({ cells: 50000 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(8, 50000);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells: 50000,
      level: 8,
      previousCells: 10000,
      noop: false,
    });
  });

  it("rejects unknown cells count", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetCellsDensityTool(runtime);
    const result = await tool.execute({ cells: 15000 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-integer / non-finite / non-number", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetCellsDensityTool(runtime);
    for (const bad of [
      Number.POSITIVE_INFINITY,
      Number.NaN,
      1.5,
      "10000",
      null,
    ]) {
      const r = await tool.execute({ cells: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when current matches target", async () => {
    const { runtime, apply } = makeRuntime(10000);
    const tool = createSetCellsDensityTool(runtime);
    const result = await tool.execute({ cells: 10000 });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: CellsDensityRuntime = {
      read: () => null,
      apply: vi.fn(() => {
        throw new Error("document is not available");
      }),
    };
    const tool = createSetCellsDensityTool(runtime);
    const result = await tool.execute({ cells: 10000 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });
});

describe("defaultCellsDensityRuntime (integration)", () => {
  const changeCellsDensity = vi.fn();
  const pointsInput = { value: "4", dataset: { cells: "10000" } };
  const pointsOutputFormatted = { value: "10K" };
  const storage: Record<string, string> = {};

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const originalChange = (globalThis as { changeCellsDensity?: unknown })
    .changeCellsDensity;

  beforeEach(() => {
    changeCellsDensity.mockReset();
    pointsInput.value = "4";
    pointsInput.dataset.cells = "10000";
    pointsOutputFormatted.value = "10K";
    for (const k of Object.keys(storage)) delete storage[k];
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        if (id === "pointsInput") return pointsInput;
        if (id === "pointsOutputFormatted") return pointsOutputFormatted;
        return null;
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
    (globalThis as { changeCellsDensity?: unknown }).changeCellsDensity =
      changeCellsDensity;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
    (globalThis as { changeCellsDensity?: unknown }).changeCellsDensity =
      originalChange;
  });

  it("delegates to changeCellsDensity and writes localStorage", async () => {
    const result = await setCellsDensityTool.execute({ cells: 50000 });
    expect(result.isError).toBeFalsy();
    expect(changeCellsDensity).toHaveBeenCalledWith(8);
    expect(storage.points).toBe("8");
  });

  it("falls back to manual DOM writes when changeCellsDensity missing", async () => {
    (globalThis as { changeCellsDensity?: unknown }).changeCellsDensity =
      undefined;
    const result = await setCellsDensityTool.execute({ cells: 30000 });
    expect(result.isError).toBeFalsy();
    expect(pointsInput.value).toBe("6");
    expect(pointsInput.dataset.cells).toBe("30000");
    expect(pointsOutputFormatted.value).toBe("30K");
    expect(storage.points).toBe("6");
  });

  it("reads current cells via pointsInput", async () => {
    // current pointsInput.value = 4 → 10000 cells; request same -> noop
    const result = await setCellsDensityTool.execute({ cells: 10000 });
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(changeCellsDensity).not.toHaveBeenCalled();
  });
});
