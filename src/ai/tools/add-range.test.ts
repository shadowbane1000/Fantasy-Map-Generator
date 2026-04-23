import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AddRangeRuntime,
  addRangeTool,
  createAddRangeTool,
  DEFAULT_RANGE_X,
  DEFAULT_RANGE_Y,
  defaultAddRangeRuntime,
} from "./add-range";

function makeRuntime() {
  const addRange = vi.fn<AddRangeRuntime["addRange"]>();
  const runtime: AddRangeRuntime = { addRange };
  return { runtime, addRange };
}

describe("add_range tool", () => {
  it("accepts numeric count / height and coerces to strings", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    const result = await tool.execute({ count: 3, height: 50 });
    expect(result.isError).toBeFalsy();
    expect(addRange).toHaveBeenCalledWith(
      "3",
      "50",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      count: "3",
      height: "50",
      rangeX: DEFAULT_RANGE_X,
      rangeY: DEFAULT_RANGE_Y,
    });
  });

  it("accepts string range count / height verbatim", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    const result = await tool.execute({ count: "2-4", height: "40-55" });
    expect(result.isError).toBeFalsy();
    expect(addRange).toHaveBeenCalledWith(
      "2-4",
      "40-55",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
    expect(JSON.parse(result.content)).toMatchObject({
      count: "2-4",
      height: "40-55",
    });
  });

  it("trims whitespace from string count / height / ranges", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    const result = await tool.execute({
      count: "  2-4 ",
      height: " 40-55 ",
      rangeX: "  10-90 ",
      rangeY: " 5-95  ",
    });
    expect(result.isError).toBeFalsy();
    expect(addRange).toHaveBeenCalledWith("2-4", "40-55", "10-90", "5-95");
  });

  it("applies default rangeX / rangeY when omitted", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    await tool.execute({ count: 1, height: 50 });
    expect(addRange).toHaveBeenCalledWith(
      "1",
      "50",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
  });

  it("treats null rangeX / rangeY as default", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    await tool.execute({
      count: 1,
      height: 50,
      rangeX: null,
      rangeY: null,
    });
    expect(addRange).toHaveBeenCalledWith(
      "1",
      "50",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
  });

  it("forwards explicit rangeX / rangeY", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    await tool.execute({
      count: 2,
      height: 40,
      rangeX: "10-90",
      rangeY: "30-70",
    });
    expect(addRange).toHaveBeenCalledWith("2", "40", "10-90", "30-70");
  });

  it("rejects missing count", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    for (const bad of [undefined, null]) {
      const r = await tool.execute({ count: bad, height: 10 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/count/);
    }
    expect(addRange).not.toHaveBeenCalled();
  });

  it("rejects missing height", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    for (const bad of [undefined, null]) {
      const r = await tool.execute({ count: 3, height: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/height/);
    }
    expect(addRange).not.toHaveBeenCalled();
  });

  it("rejects non-finite numeric count / height", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ count: bad, height: 10 });
      expect(r.isError).toBe(true);
    }
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY]) {
      const r = await tool.execute({ count: 1, height: bad });
      expect(r.isError).toBe(true);
    }
    expect(addRange).not.toHaveBeenCalled();
  });

  it("rejects empty-string count / height", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    const r1 = await tool.execute({ count: "   ", height: 10 });
    expect(r1.isError).toBe(true);
    const r2 = await tool.execute({ count: 1, height: "" });
    expect(r2.isError).toBe(true);
    expect(addRange).not.toHaveBeenCalled();
  });

  it("rejects non-string / empty rangeX / rangeY", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    for (const bad of [42, true, {}, "", "   "]) {
      const r = await tool.execute({ count: 1, height: 1, rangeX: bad });
      expect(r.isError).toBe(true);
    }
    for (const bad of [42, true, {}, "", "   "]) {
      const r = await tool.execute({ count: 1, height: 1, rangeY: bad });
      expect(r.isError).toBe(true);
    }
    expect(addRange).not.toHaveBeenCalled();
  });

  it("rejects non-number, non-string count type", async () => {
    const { runtime, addRange } = makeRuntime();
    const tool = createAddRangeTool(runtime);
    for (const bad of [true, {}, []]) {
      const r = await tool.execute({ count: bad, height: 1 });
      expect(r.isError).toBe(true);
    }
    expect(addRange).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: AddRangeRuntime = {
      addRange: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createAddRangeTool(runtime);
    const result = await tool.execute({ count: 1, height: 50 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as addRangeTool with the expected schema", () => {
    expect(addRangeTool.name).toBe("add_range");
    expect(addRangeTool.input_schema.type).toBe("object");
    expect(addRangeTool.input_schema.required).toEqual(["count", "height"]);
  });
});

describe("defaultAddRangeRuntime (integration)", () => {
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
      addRange() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() =>
      defaultAddRangeRuntime.addRange("1", "50", "20-80", "20-80"),
    ).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() =>
      defaultAddRangeRuntime.addRange("1", "50", "20-80", "20-80"),
    ).toThrow(/HeightmapGenerator/);
  });

  it("calls setGraph → addRange → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [10, 20, 30, 40];
    const withRange = [10, 60, 70, 40];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [string, string, string, string] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      addRange(count: string, height: string, rangeX: string, rangeY: string) {
        calls.push("addRange");
        latestArgs = [count, height, rangeX, rangeY];
      },
      getHeights() {
        calls.push("getHeights");
        return withRange;
      },
    } as unknown as object;

    defaultAddRangeRuntime.addRange("2-3", "40-55", "10-90", "30-70");

    expect(calls).toEqual(["setGraph", "addRange", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual(["2-3", "40-55", "10-90", "30-70"]);
    expect(grid.cells.h).toBe(withRange);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      addRange() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() =>
      defaultAddRangeRuntime.addRange("1", "50", "20-80", "20-80"),
    ).toThrow(/getHeights/);
  });

  it("throws when HeightmapGenerator is missing required methods", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    // Missing `addRange`
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      getHeights() {
        return [];
      },
    } as unknown as object;

    expect(() =>
      defaultAddRangeRuntime.addRange("1", "50", "20-80", "20-80"),
    ).toThrow(/HeightmapGenerator/);
  });
});
