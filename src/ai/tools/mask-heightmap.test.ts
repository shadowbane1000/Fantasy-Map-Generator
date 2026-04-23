import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMaskHeightmapTool,
  defaultMaskHeightmapRuntime,
  type MaskHeightmapRuntime,
  maskHeightmapTool,
} from "./mask-heightmap";

function makeRuntime(cellsChanged = 42) {
  const mask = vi.fn<MaskHeightmapRuntime["mask"]>(() => ({
    cellsChanged,
  }));
  const runtime: MaskHeightmapRuntime = { mask };
  return { runtime, mask };
}

describe("mask_heightmap tool", () => {
  it("uses UI default power=1 when called without arguments", async () => {
    const { runtime, mask } = makeRuntime();
    const tool = createMaskHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(mask).toHaveBeenCalledWith(1);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      power: 1,
      cellsChanged: 42,
    });
  });

  it("forwards explicit power", async () => {
    const { runtime, mask } = makeRuntime(7);
    const tool = createMaskHeightmapTool(runtime);
    const result = await tool.execute({ power: 2 });
    expect(result.isError).toBeFalsy();
    expect(mask).toHaveBeenCalledWith(2);
    const body = JSON.parse(result.content);
    expect(body.power).toBe(2);
    expect(body.cellsChanged).toBe(7);
  });

  it("forwards negative power (inverted mask)", async () => {
    const { runtime, mask } = makeRuntime();
    const tool = createMaskHeightmapTool(runtime);
    const result = await tool.execute({ power: -3 });
    expect(result.isError).toBeFalsy();
    expect(mask).toHaveBeenCalledWith(-3);
  });

  it("accepts boundary values (-10, 0, 10)", async () => {
    const { runtime, mask } = makeRuntime();
    const tool = createMaskHeightmapTool(runtime);
    for (const v of [-10, 0, 10]) {
      mask.mockClear();
      const r = await tool.execute({ power: v });
      expect(r.isError).toBeFalsy();
      expect(mask).toHaveBeenCalledWith(v);
    }
  });

  it("rejects non-numeric power", async () => {
    const { runtime, mask } = makeRuntime();
    const tool = createMaskHeightmapTool(runtime);
    for (const bad of [
      "1",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ power: bad });
      expect(r.isError).toBe(true);
    }
    expect(mask).not.toHaveBeenCalled();
  });

  it("treats null/undefined power as default", async () => {
    const { runtime, mask } = makeRuntime();
    const tool = createMaskHeightmapTool(runtime);
    for (const raw of [null, undefined]) {
      mask.mockClear();
      const r = await tool.execute({ power: raw });
      expect(r.isError).toBeFalsy();
      expect(mask).toHaveBeenCalledWith(1);
    }
  });

  it("rejects out-of-range power", async () => {
    const { runtime, mask } = makeRuntime();
    const tool = createMaskHeightmapTool(runtime);
    for (const bad of [-11, 11, 1000, -1000]) {
      const r = await tool.execute({ power: bad });
      expect(r.isError).toBe(true);
    }
    expect(mask).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: MaskHeightmapRuntime = {
      mask: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createMaskHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as maskHeightmapTool with the expected name", () => {
    expect(maskHeightmapTool.name).toBe("mask_heightmap");
    expect(maskHeightmapTool.input_schema.type).toBe("object");
    // Defaults mean nothing is required.
    expect(maskHeightmapTool.input_schema.required).toBeUndefined();
  });
});

describe("defaultMaskHeightmapRuntime (integration)", () => {
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
      mask() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() => defaultMaskHeightmapRuntime.mask(1)).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() => defaultMaskHeightmapRuntime.mask(1)).toThrow(
      /HeightmapGenerator/,
    );
  });

  it("calls setGraph → mask → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [10, 20, 30, 40];
    const masked = [11, 20, 31, 41];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestPower: number | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      mask(power: number) {
        calls.push("mask");
        latestPower = power;
      },
      getHeights() {
        calls.push("getHeights");
        return masked;
      },
    } as unknown as object;

    const { cellsChanged } = defaultMaskHeightmapRuntime.mask(2);

    expect(calls).toEqual(["setGraph", "mask", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestPower).toBe(2);
    expect(grid.cells.h).toBe(masked);
    // (10→11), (20→20), (30→31), (40→41) = 3 changes
    expect(cellsChanged).toBe(3);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      mask() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() => defaultMaskHeightmapRuntime.mask(1)).toThrow(/getHeights/);
  });
});
