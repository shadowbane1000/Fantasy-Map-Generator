import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClearHeightmapRuntime,
  clearHeightmapTool,
  createClearHeightmapTool,
  defaultClearHeightmapRuntime,
} from "./clear-heightmap";

function makeRuntime(cellsCleared = 42) {
  const clear = vi.fn<ClearHeightmapRuntime["clear"]>(() => ({
    cellsCleared,
  }));
  const runtime: ClearHeightmapRuntime = { clear };
  return { runtime, clear };
}

describe("clear_heightmap tool", () => {
  it("uses the default height 0 when called without arguments", async () => {
    const { runtime, clear } = makeRuntime();
    const tool = createClearHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(clear).toHaveBeenCalledWith(0);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      height: 0,
      cellsCleared: 42,
    });
  });

  it("forwards an explicit height", async () => {
    const { runtime, clear } = makeRuntime(7);
    const tool = createClearHeightmapTool(runtime);
    const result = await tool.execute({ height: 20 });
    expect(result.isError).toBeFalsy();
    expect(clear).toHaveBeenCalledWith(20);
    const body = JSON.parse(result.content);
    expect(body.height).toBe(20);
    expect(body.cellsCleared).toBe(7);
  });

  it("treats null/undefined height as the default", async () => {
    const { runtime, clear } = makeRuntime();
    const tool = createClearHeightmapTool(runtime);
    for (const raw of [null, undefined]) {
      clear.mockClear();
      const r = await tool.execute({ height: raw });
      expect(r.isError).toBeFalsy();
      expect(clear).toHaveBeenCalledWith(0);
    }
  });

  it("rejects non-numeric height", async () => {
    const { runtime, clear } = makeRuntime();
    const tool = createClearHeightmapTool(runtime);
    for (const bad of [
      "0",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ height: bad });
      expect(r.isError).toBe(true);
    }
    expect(clear).not.toHaveBeenCalled();
  });

  it("rejects out-of-range height", async () => {
    const { runtime, clear } = makeRuntime();
    const tool = createClearHeightmapTool(runtime);
    for (const bad of [-1, -100, 101, 1000]) {
      const r = await tool.execute({ height: bad });
      expect(r.isError).toBe(true);
    }
    expect(clear).not.toHaveBeenCalled();
  });

  it("accepts height = 100 (boundary)", async () => {
    const { runtime, clear } = makeRuntime();
    const tool = createClearHeightmapTool(runtime);
    const r = await tool.execute({ height: 100 });
    expect(r.isError).toBeFalsy();
    expect(clear).toHaveBeenCalledWith(100);
  });

  it("surfaces runtime errors", async () => {
    const runtime: ClearHeightmapRuntime = {
      clear: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createClearHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as clearHeightmapTool with the expected shape", () => {
    expect(clearHeightmapTool.name).toBe("clear_heightmap");
    expect(clearHeightmapTool.input_schema.type).toBe("object");
    // No required keys — height is optional.
    expect(clearHeightmapTool.input_schema.required).toBeUndefined();
  });
});

describe("defaultClearHeightmapRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    grid?: unknown;
  };
  const originalGrid = globalsRef.grid;

  afterEach(() => {
    globalsRef.grid = originalGrid;
  });

  it("throws when window.grid is missing", () => {
    globalsRef.grid = undefined;
    expect(() => defaultClearHeightmapRuntime.clear(0)).toThrow(/grid/);
  });

  it("throws when grid.cells.h is missing", () => {
    globalsRef.grid = { cells: {} } as unknown as object;
    expect(() => defaultClearHeightmapRuntime.clear(0)).toThrow(/grid/);
  });

  it("clears every cell to 0 by default and counts changed cells", () => {
    const heights = [10, 0, 50, 100, 0];
    globalsRef.grid = { cells: { h: heights } } as unknown as object;

    const { cellsCleared } = defaultClearHeightmapRuntime.clear(0);

    // 3 non-zero cells → 3 changes.
    expect(cellsCleared).toBe(3);
    expect(heights).toEqual([0, 0, 0, 0, 0]);
  });

  it("writes a custom height into every cell", () => {
    const heights = [10, 0, 50, 20, 0];
    globalsRef.grid = { cells: { h: heights } } as unknown as object;

    const { cellsCleared } = defaultClearHeightmapRuntime.clear(20);

    // Only cells that weren't already 20 change: 10, 0, 50, 0 → 4 changes.
    expect(cellsCleared).toBe(4);
    expect(heights).toEqual([20, 20, 20, 20, 20]);
  });

  it("is idempotent on an already-zero heightmap", () => {
    const heights = [0, 0, 0, 0];
    globalsRef.grid = { cells: { h: heights } } as unknown as object;

    const { cellsCleared } = defaultClearHeightmapRuntime.clear(0);

    expect(cellsCleared).toBe(0);
    expect(heights).toEqual([0, 0, 0, 0]);
  });

  it("mutates a typed array in place without replacing it", () => {
    const typed = new Uint8Array([5, 10, 15, 20]);
    const cells = { h: typed };
    globalsRef.grid = { cells } as unknown as object;

    const { cellsCleared } = defaultClearHeightmapRuntime.clear(0);

    expect(cellsCleared).toBe(4);
    // Same reference is preserved — we wrote in place.
    expect(cells.h).toBe(typed);
    expect(Array.from(typed)).toEqual([0, 0, 0, 0]);
  });
});
