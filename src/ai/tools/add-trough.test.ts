import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RANGE_X, DEFAULT_RANGE_Y } from "./add-hill";
import {
  type AddTroughRuntime,
  addTroughTool,
  createAddTroughTool,
  defaultAddTroughRuntime,
} from "./add-trough";

function makeRuntime(cellsChanged = 12) {
  const addTrough = vi.fn<AddTroughRuntime["addTrough"]>(() => ({
    cellsChanged,
  }));
  const runtime: AddTroughRuntime = { addTrough };
  return { runtime, addTrough };
}

describe("add_trough tool", () => {
  it("passes range strings straight through", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    const result = await tool.execute({ count: "1-3", height: "30-60" });
    expect(result.isError).toBeFalsy();
    expect(addTrough).toHaveBeenCalledWith(
      "1-3",
      "30-60",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      count: "1-3",
      height: "30-60",
      rangeX: DEFAULT_RANGE_X,
      rangeY: DEFAULT_RANGE_Y,
      cellsChanged: 12,
    });
  });

  it("coerces numeric count/height to strings", async () => {
    const { runtime, addTrough } = makeRuntime(7);
    const tool = createAddTroughTool(runtime);
    const result = await tool.execute({ count: 2, height: 40 });
    expect(result.isError).toBeFalsy();
    expect(addTrough).toHaveBeenCalledWith("2", "40", "20-80", "20-80");
    const body = JSON.parse(result.content);
    expect(body.count).toBe("2");
    expect(body.height).toBe("40");
    expect(body.cellsChanged).toBe(7);
  });

  it("forwards explicit rangeX and rangeY", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    const result = await tool.execute({
      count: "1",
      height: "40",
      rangeX: "40-60",
      rangeY: "10-90",
    });
    expect(result.isError).toBeFalsy();
    expect(addTrough).toHaveBeenCalledWith("1", "40", "40-60", "10-90");
    const body = JSON.parse(result.content);
    expect(body.rangeX).toBe("40-60");
    expect(body.rangeY).toBe("10-90");
  });

  it("rejects missing count", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ count: raw, height: "30" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/count/);
    }
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("rejects missing height", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ count: "1", height: raw });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/height/);
    }
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-scalar count", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      true,
      {},
      [],
    ]) {
      const r = await tool.execute({ count: bad, height: "30" });
      expect(r.isError).toBe(true);
    }
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-scalar height", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      true,
      {},
      [],
    ]) {
      const r = await tool.execute({ count: "1", height: bad });
      expect(r.isError).toBe(true);
    }
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace string count and height", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    for (const bad of ["", "   ", "\t"]) {
      const a = await tool.execute({ count: bad, height: "30" });
      expect(a.isError).toBe(true);
      const b = await tool.execute({ count: "1", height: bad });
      expect(b.isError).toBe(true);
    }
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("rejects numeric rangeX / rangeY", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    const rx = await tool.execute({ count: "1", height: "30", rangeX: 30 });
    expect(rx.isError).toBe(true);
    expect(JSON.parse(rx.content).error).toMatch(/rangeX/);
    const ry = await tool.execute({ count: "1", height: "30", rangeY: 40 });
    expect(ry.isError).toBe(true);
    expect(JSON.parse(ry.content).error).toMatch(/rangeY/);
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("rejects empty-string rangeX / rangeY", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    const rx = await tool.execute({ count: "1", height: "30", rangeX: "" });
    expect(rx.isError).toBe(true);
    const ry = await tool.execute({
      count: "1",
      height: "30",
      rangeY: "   ",
    });
    expect(ry.isError).toBe(true);
    expect(addTrough).not.toHaveBeenCalled();
  });

  it("treats null/undefined rangeX / rangeY as defaults", async () => {
    const { runtime, addTrough } = makeRuntime();
    const tool = createAddTroughTool(runtime);
    const result = await tool.execute({
      count: "1",
      height: "30",
      rangeX: null,
      rangeY: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(addTrough).toHaveBeenCalledWith(
      "1",
      "30",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
  });

  it("surfaces runtime errors", async () => {
    const runtime: AddTroughRuntime = {
      addTrough: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createAddTroughTool(runtime);
    const result = await tool.execute({ count: "1", height: "30" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as addTroughTool with the expected name and required params", () => {
    expect(addTroughTool.name).toBe("add_trough");
    expect(addTroughTool.input_schema.type).toBe("object");
    expect(addTroughTool.input_schema.required).toEqual(["count", "height"]);
  });
});

describe("defaultAddTroughRuntime (integration)", () => {
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
      addTrough() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() =>
      defaultAddTroughRuntime.addTrough("1", "30", "20-80", "20-80"),
    ).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() =>
      defaultAddTroughRuntime.addTrough("1", "30", "20-80", "20-80"),
    ).toThrow(/HeightmapGenerator/);
  });

  it("calls setGraph → addTrough → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [50, 60, 70, 80];
    const afterH = [50, 40, 70, 55];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [string, string, string, string] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      addTrough(count: string, height: string, rangeX: string, rangeY: string) {
        calls.push("addTrough");
        latestArgs = [count, height, rangeX, rangeY];
      },
      getHeights() {
        calls.push("getHeights");
        return afterH;
      },
    } as unknown as object;

    const { cellsChanged } = defaultAddTroughRuntime.addTrough(
      "2",
      "40",
      "25-75",
      "10-90",
    );

    expect(calls).toEqual(["setGraph", "addTrough", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual(["2", "40", "25-75", "10-90"]);
    expect(grid.cells.h).toBe(afterH);
    // (50→50 no), (60→40 yes), (70→70 no), (80→55 yes) = 2 changes
    expect(cellsChanged).toBe(2);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      addTrough() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() =>
      defaultAddTroughRuntime.addTrough("1", "30", "20-80", "20-80"),
    ).toThrow(/getHeights/);
  });

  it("throws when HeightmapGenerator is missing required methods", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    // Missing `addTrough`
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      getHeights() {
        return [];
      },
    } as unknown as object;

    expect(() =>
      defaultAddTroughRuntime.addTrough("1", "30", "20-80", "20-80"),
    ).toThrow(/HeightmapGenerator/);
  });
});
