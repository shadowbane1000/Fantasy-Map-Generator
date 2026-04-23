import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInvertHeightmapTool,
  defaultInvertHeightmapRuntime,
  type InvertHeightmapRuntime,
  invertHeightmapTool,
} from "./invert-heightmap";

function makeRuntime(cellsChanged = 42) {
  const invert = vi.fn<InvertHeightmapRuntime["invert"]>(() => ({
    cellsChanged,
  }));
  const runtime: InvertHeightmapRuntime = { invert };
  return { runtime, invert };
}

describe("invert_heightmap tool", () => {
  it("applies default count when only axes is provided", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    const result = await tool.execute({ axes: "x" });
    expect(result.isError).toBeFalsy();
    expect(invert).toHaveBeenCalledWith(1, "x");
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      count: 1,
      axes: "x",
      cellsChanged: 42,
    });
  });

  it("forwards explicit count and axes", async () => {
    const { runtime, invert } = makeRuntime(7);
    const tool = createInvertHeightmapTool(runtime);
    const result = await tool.execute({ axes: "xy", count: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(invert).toHaveBeenCalledWith(0.5, "xy");
    const body = JSON.parse(result.content);
    expect(body.count).toBe(0.5);
    expect(body.axes).toBe("xy");
    expect(body.cellsChanged).toBe(7);
  });

  it("accepts all three canonical axis values", async () => {
    for (const axes of ["x", "y", "xy"] as const) {
      const { runtime, invert } = makeRuntime();
      const tool = createInvertHeightmapTool(runtime);
      const result = await tool.execute({ axes });
      expect(result.isError).toBeFalsy();
      expect(invert).toHaveBeenCalledWith(1, axes);
    }
  });

  it("normalises aliases to canonical axis values", async () => {
    const cases: Array<[string, string]> = [
      ["X", "x"],
      ["Y", "y"],
      ["XY", "xy"],
      ["YX", "xy"],
      ["yx", "xy"],
      ["both", "xy"],
      ["Both", "xy"],
      ["BOTH", "xy"],
      [" x ", "x"],
    ];
    for (const [input, expected] of cases) {
      const { runtime, invert } = makeRuntime();
      const tool = createInvertHeightmapTool(runtime);
      const result = await tool.execute({ axes: input });
      expect(result.isError).toBeFalsy();
      expect(invert).toHaveBeenCalledWith(1, expected);
      const body = JSON.parse(result.content);
      expect(body.axes).toBe(expected);
    }
  });

  it("rejects missing axes", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ axes: raw });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/axes/);
    }
    expect(invert).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace axes", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    for (const bad of ["", "   ", "\t"]) {
      const r = await tool.execute({ axes: bad });
      expect(r.isError).toBe(true);
    }
    expect(invert).not.toHaveBeenCalled();
  });

  it("rejects unknown axes strings", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    for (const bad of ["z", "foo", "xyz", "x-y", "horizontal", "vertical"]) {
      const r = await tool.execute({ axes: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/axes|Unknown/);
    }
    expect(invert).not.toHaveBeenCalled();
  });

  it("rejects non-string axes", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    for (const bad of [1, true, {}, []]) {
      const r = await tool.execute({ axes: bad as unknown });
      expect(r.isError).toBe(true);
    }
    expect(invert).not.toHaveBeenCalled();
  });

  it("rejects non-finite count", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    const bads = [Number.NaN, Number.POSITIVE_INFINITY, "0.5", true, {}];
    for (const bad of bads) {
      const r = await tool.execute({ axes: "x", count: bad as unknown });
      expect(r.isError).toBe(true);
    }
    expect(invert).not.toHaveBeenCalled();
  });

  it("rejects count outside [0, 1]", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    for (const bad of [-0.01, -1, 1.01, 2, 100]) {
      const r = await tool.execute({ axes: "x", count: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/range|count/);
    }
    expect(invert).not.toHaveBeenCalled();
  });

  it("accepts count at boundaries 0 and 1", async () => {
    for (const count of [0, 1]) {
      const { runtime, invert } = makeRuntime();
      const tool = createInvertHeightmapTool(runtime);
      const result = await tool.execute({ axes: "x", count });
      expect(result.isError).toBeFalsy();
      expect(invert).toHaveBeenCalledWith(count, "x");
    }
  });

  it("treats null/undefined count as default", async () => {
    const { runtime, invert } = makeRuntime();
    const tool = createInvertHeightmapTool(runtime);
    const r1 = await tool.execute({ axes: "x", count: null });
    expect(r1.isError).toBeFalsy();
    expect(invert).toHaveBeenLastCalledWith(1, "x");
    const r2 = await tool.execute({ axes: "x", count: undefined });
    expect(r2.isError).toBeFalsy();
    expect(invert).toHaveBeenLastCalledWith(1, "x");
  });

  it("surfaces runtime errors", async () => {
    const runtime: InvertHeightmapRuntime = {
      invert: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createInvertHeightmapTool(runtime);
    const result = await tool.execute({ axes: "x" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as invertHeightmapTool with the expected name and required params", () => {
    expect(invertHeightmapTool.name).toBe("invert_heightmap");
    expect(invertHeightmapTool.input_schema.type).toBe("object");
    expect(invertHeightmapTool.input_schema.required).toEqual(["axes"]);
  });
});

describe("defaultInvertHeightmapRuntime (integration)", () => {
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
      invert() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() => defaultInvertHeightmapRuntime.invert(1, "x")).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() => defaultInvertHeightmapRuntime.invert(1, "x")).toThrow(
      /HeightmapGenerator/,
    );
  });

  it("calls setGraph → invert → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [10, 20, 30, 40];
    const afterH = [40, 30, 20, 10];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [number, string] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      invert(count: number, axes: string) {
        calls.push("invert");
        latestArgs = [count, axes];
      },
      getHeights() {
        calls.push("getHeights");
        return afterH;
      },
    } as unknown as object;

    const { cellsChanged } = defaultInvertHeightmapRuntime.invert(1, "xy");

    expect(calls).toEqual(["setGraph", "invert", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual([1, "xy"]);
    expect(grid.cells.h).toBe(afterH);
    // (10→40), (20→30), (30→20), (40→10) = 4 changes
    expect(cellsChanged).toBe(4);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      invert() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() => defaultInvertHeightmapRuntime.invert(1, "x")).toThrow(
      /getHeights/,
    );
  });
});
