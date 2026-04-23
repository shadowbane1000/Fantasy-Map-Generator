import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSmoothHeightmapTool,
  DEFAULT_SMOOTH_ADD,
  DEFAULT_SMOOTH_FACTOR,
  defaultSmoothHeightmapRuntime,
  type SmoothHeightmapRuntime,
  smoothHeightmapTool,
} from "./smooth-heightmap";

function makeRuntime(cellsChanged = 42) {
  const smooth = vi.fn<SmoothHeightmapRuntime["smooth"]>(() => ({
    cellsChanged,
  }));
  const runtime: SmoothHeightmapRuntime = { smooth };
  return { runtime, smooth };
}

describe("smooth_heightmap tool", () => {
  it("uses UI defaults when called without arguments", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(smooth).toHaveBeenCalledWith(
      DEFAULT_SMOOTH_FACTOR,
      DEFAULT_SMOOTH_ADD,
    );
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      factor: DEFAULT_SMOOTH_FACTOR,
      add: DEFAULT_SMOOTH_ADD,
      cellsChanged: 42,
    });
  });

  it("forwards explicit factor and add", async () => {
    const { runtime, smooth } = makeRuntime(7);
    const tool = createSmoothHeightmapTool(runtime);
    const result = await tool.execute({ factor: 2, add: 0 });
    expect(result.isError).toBeFalsy();
    expect(smooth).toHaveBeenCalledWith(2, 0);
    const body = JSON.parse(result.content);
    expect(body.factor).toBe(2);
    expect(body.add).toBe(0);
    expect(body.cellsChanged).toBe(7);
  });

  it("accepts factor = 1 (full smooth)", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    const result = await tool.execute({ factor: 1 });
    expect(result.isError).toBeFalsy();
    expect(smooth).toHaveBeenCalledWith(1, DEFAULT_SMOOTH_ADD);
  });

  it("rejects non-numeric factor", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    for (const bad of ["4", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ factor: bad });
      expect(r.isError).toBe(true);
    }
    expect(smooth).not.toHaveBeenCalled();
  });

  it("treats null/undefined factor as default", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    for (const raw of [null, undefined]) {
      smooth.mockClear();
      const r = await tool.execute({ factor: raw });
      expect(r.isError).toBeFalsy();
      expect(smooth).toHaveBeenCalledWith(
        DEFAULT_SMOOTH_FACTOR,
        DEFAULT_SMOOTH_ADD,
      );
    }
  });

  it("rejects out-of-range factor", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    for (const bad of [0, 0.5, -1, 101, 1000]) {
      const r = await tool.execute({ factor: bad });
      expect(r.isError).toBe(true);
    }
    expect(smooth).not.toHaveBeenCalled();
  });

  it("rejects non-numeric add", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    for (const bad of ["1.5", true, {}, Number.NaN]) {
      const r = await tool.execute({ add: bad });
      expect(r.isError).toBe(true);
    }
    expect(smooth).not.toHaveBeenCalled();
  });

  it("rejects out-of-range add", async () => {
    const { runtime, smooth } = makeRuntime();
    const tool = createSmoothHeightmapTool(runtime);
    for (const bad of [-101, 101, 1000]) {
      const r = await tool.execute({ add: bad });
      expect(r.isError).toBe(true);
    }
    expect(smooth).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: SmoothHeightmapRuntime = {
      smooth: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createSmoothHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as smoothHeightmapTool with the expected name", () => {
    expect(smoothHeightmapTool.name).toBe("smooth_heightmap");
    expect(smoothHeightmapTool.input_schema.type).toBe("object");
    // Defaults mean nothing is required.
    expect(smoothHeightmapTool.input_schema.required).toBeUndefined();
  });
});

describe("defaultSmoothHeightmapRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    grid?: unknown;
    HeightmapGenerator?: unknown;
  };
  const originalGrid = globalsRef.grid;
  const originalHeightmap = globalsRef.HeightmapGenerator;

  afterEach(() => {
    globalsRef.grid = originalGrid;
    globalsRef.HeightmapGenerator = originalHeightmap;
  });

  it("throws when window.grid is missing", () => {
    globalsRef.grid = undefined;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      smooth() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() => defaultSmoothHeightmapRuntime.smooth(4, 1.5)).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() => defaultSmoothHeightmapRuntime.smooth(4, 1.5)).toThrow(
      /HeightmapGenerator/,
    );
  });

  it("calls setGraph → smooth → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [10, 20, 30, 40];
    const smoothed = [11, 20, 31, 41];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [number, number] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      smooth(factor: number, add: number) {
        calls.push("smooth");
        latestArgs = [factor, add];
      },
      getHeights() {
        calls.push("getHeights");
        return smoothed;
      },
    } as unknown as object;

    const { cellsChanged } = defaultSmoothHeightmapRuntime.smooth(3, 0.5);

    expect(calls).toEqual(["setGraph", "smooth", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual([3, 0.5]);
    expect(grid.cells.h).toBe(smoothed);
    // (10→11), (20→20), (30→31), (40→41) = 3 changes
    expect(cellsChanged).toBe(3);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      smooth() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() => defaultSmoothHeightmapRuntime.smooth(4, 1.5)).toThrow(
      /getHeights/,
    );
  });
});
