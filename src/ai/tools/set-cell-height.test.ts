import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSetCellHeightTool,
  defaultSetCellHeightRuntime,
  type SetCellHeightRuntime,
  setCellHeightTool,
} from "./set-cell-height";

function makeRuntime(previousHeight = 17) {
  const set = vi.fn<SetCellHeightRuntime["set"]>(() => ({ previousHeight }));
  const runtime: SetCellHeightRuntime = { set };
  return { runtime, set };
}

describe("set_cell_height tool", () => {
  it("writes the height through the runtime on a happy path", async () => {
    const { runtime, set } = makeRuntime(42);
    const tool = createSetCellHeightTool(runtime);
    const result = await tool.execute({ cell: 123, height: 60 });
    expect(result.isError).toBeFalsy();
    expect(set).toHaveBeenCalledWith(123, 60);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      cell: 123,
      previousHeight: 42,
      height: 60,
    });
  });

  it("accepts cell = 0 and height = 0 (lower boundaries)", async () => {
    const { runtime, set } = makeRuntime(5);
    const tool = createSetCellHeightTool(runtime);
    const result = await tool.execute({ cell: 0, height: 0 });
    expect(result.isError).toBeFalsy();
    expect(set).toHaveBeenCalledWith(0, 0);
  });

  it("accepts height = 100 (upper boundary)", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    const result = await tool.execute({ cell: 5, height: 100 });
    expect(result.isError).toBeFalsy();
    expect(set).toHaveBeenCalledWith(5, 100);
  });

  it("rejects missing cell", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: missing, height: 50 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/cell/i);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects missing height", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: 1, height: missing });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/height/i);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects non-numeric cell", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const bad of [
      "1",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ cell: bad, height: 50 });
      expect(r.isError).toBe(true);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects non-integer cell", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const bad of [1.5, 2.1, 3.9999]) {
      const r = await tool.execute({ cell: bad, height: 50 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/integer/);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects negative cell", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    const r = await tool.execute({ cell: -1, height: 50 });
    expect(r.isError).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects non-numeric height", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const bad of ["50", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ cell: 0, height: bad });
      expect(r.isError).toBe(true);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects non-integer height", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const bad of [50.5, 0.1, 99.9]) {
      const r = await tool.execute({ cell: 0, height: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/integer/);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects out-of-range height", async () => {
    const { runtime, set } = makeRuntime();
    const tool = createSetCellHeightTool(runtime);
    for (const bad of [-1, -50, 101, 500]) {
      const r = await tool.execute({ cell: 0, height: bad });
      expect(r.isError).toBe(true);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors as isError", async () => {
    const runtime: SetCellHeightRuntime = {
      set: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createSetCellHeightTool(runtime);
    const result = await tool.execute({ cell: 0, height: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("surfaces out-of-bounds runtime errors", async () => {
    const runtime: SetCellHeightRuntime = {
      set: vi.fn(() => {
        throw new Error("cell index 999 is out of bounds");
      }),
    };
    const tool = createSetCellHeightTool(runtime);
    const result = await tool.execute({ cell: 999, height: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of bounds/);
  });

  it("is exported as setCellHeightTool with the expected shape", () => {
    expect(setCellHeightTool.name).toBe("set_cell_height");
    expect(setCellHeightTool.input_schema.type).toBe("object");
    expect(setCellHeightTool.input_schema.required).toEqual(["cell", "height"]);
  });
});

describe("defaultSetCellHeightRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    grid?: unknown;
  };
  const originalGrid = globalsRef.grid;

  afterEach(() => {
    globalsRef.grid = originalGrid;
  });

  it("throws when window.grid is missing", () => {
    globalsRef.grid = undefined;
    expect(() => defaultSetCellHeightRuntime.set(0, 10)).toThrow(/grid/);
  });

  it("throws when grid.cells.h is missing", () => {
    globalsRef.grid = { cells: {} } as unknown as object;
    expect(() => defaultSetCellHeightRuntime.set(0, 10)).toThrow(/grid/);
  });

  it("throws when cell is out of bounds (from grid.cells.i length)", () => {
    const heights = [10, 20, 30, 40];
    const indices = [0, 1, 2, 3];
    globalsRef.grid = {
      cells: { h: heights, i: indices },
    } as unknown as object;
    expect(() => defaultSetCellHeightRuntime.set(4, 50)).toThrow(
      /out of bounds/,
    );
    expect(() => defaultSetCellHeightRuntime.set(-1, 50)).toThrow(
      /out of bounds/,
    );
    // Heights must not have mutated.
    expect(heights).toEqual([10, 20, 30, 40]);
  });

  it("falls back to heights.length when grid.cells.i is missing", () => {
    const heights = [5, 10, 15];
    globalsRef.grid = { cells: { h: heights } } as unknown as object;
    expect(() => defaultSetCellHeightRuntime.set(3, 50)).toThrow(
      /out of bounds/,
    );
    const { previousHeight } = defaultSetCellHeightRuntime.set(1, 99);
    expect(previousHeight).toBe(10);
    expect(heights).toEqual([5, 99, 15]);
  });

  it("writes the height in place and returns the previous value", () => {
    const heights = [10, 20, 30, 40];
    const indices = [0, 1, 2, 3];
    globalsRef.grid = {
      cells: { h: heights, i: indices },
    } as unknown as object;

    const { previousHeight } = defaultSetCellHeightRuntime.set(2, 75);

    expect(previousHeight).toBe(30);
    expect(heights).toEqual([10, 20, 75, 40]);
  });

  it("mutates a Uint8Array in place without replacing it", () => {
    const typed = new Uint8Array([5, 10, 15, 20]);
    const indices = [0, 1, 2, 3];
    const cells = { h: typed, i: indices };
    globalsRef.grid = { cells } as unknown as object;

    const { previousHeight } = defaultSetCellHeightRuntime.set(3, 100);

    expect(previousHeight).toBe(20);
    expect(cells.h).toBe(typed);
    expect(Array.from(typed)).toEqual([5, 10, 15, 100]);
  });

  it("allows writing height = 0 (sea level / blank ocean)", () => {
    const heights = [50, 50, 50];
    globalsRef.grid = { cells: { h: heights } } as unknown as object;

    const { previousHeight } = defaultSetCellHeightRuntime.set(1, 0);

    expect(previousHeight).toBe(50);
    expect(heights).toEqual([50, 0, 50]);
  });
});
