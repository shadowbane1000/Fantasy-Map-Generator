import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AddHillRuntime,
  addHillTool,
  createAddHillTool,
  DEFAULT_RANGE_X,
  DEFAULT_RANGE_Y,
  defaultAddHillRuntime,
} from "./add-hill";

function makeRuntime(cellsChanged = 12) {
  const addHill = vi.fn<AddHillRuntime["addHill"]>(() => ({ cellsChanged }));
  const runtime: AddHillRuntime = { addHill };
  return { runtime, addHill };
}

describe("add_hill tool", () => {
  it("passes range strings straight through", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    const result = await tool.execute({ count: "1-3", height: "30-60" });
    expect(result.isError).toBeFalsy();
    expect(addHill).toHaveBeenCalledWith(
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
    const { runtime, addHill } = makeRuntime(5);
    const tool = createAddHillTool(runtime);
    const result = await tool.execute({ count: 2, height: 50 });
    expect(result.isError).toBeFalsy();
    expect(addHill).toHaveBeenCalledWith("2", "50", "20-80", "20-80");
    const body = JSON.parse(result.content);
    expect(body.count).toBe("2");
    expect(body.height).toBe("50");
    expect(body.cellsChanged).toBe(5);
  });

  it("forwards explicit rangeX and rangeY", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    const result = await tool.execute({
      count: "1",
      height: "40",
      rangeX: "40-60",
      rangeY: "10-90",
    });
    expect(result.isError).toBeFalsy();
    expect(addHill).toHaveBeenCalledWith("1", "40", "40-60", "10-90");
    const body = JSON.parse(result.content);
    expect(body.rangeX).toBe("40-60");
    expect(body.rangeY).toBe("10-90");
  });

  it("rejects missing count", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ count: raw, height: "30" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/count/);
    }
    expect(addHill).not.toHaveBeenCalled();
  });

  it("rejects missing height", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ count: "1", height: raw });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/height/);
    }
    expect(addHill).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-scalar count", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
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
    expect(addHill).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-scalar height", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
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
    expect(addHill).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace string count and height", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    for (const bad of ["", "   ", "\t"]) {
      const a = await tool.execute({ count: bad, height: "30" });
      expect(a.isError).toBe(true);
      const b = await tool.execute({ count: "1", height: bad });
      expect(b.isError).toBe(true);
    }
    expect(addHill).not.toHaveBeenCalled();
  });

  it("rejects numeric rangeX / rangeY", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    const rx = await tool.execute({ count: "1", height: "30", rangeX: 30 });
    expect(rx.isError).toBe(true);
    expect(JSON.parse(rx.content).error).toMatch(/rangeX/);
    const ry = await tool.execute({ count: "1", height: "30", rangeY: 40 });
    expect(ry.isError).toBe(true);
    expect(JSON.parse(ry.content).error).toMatch(/rangeY/);
    expect(addHill).not.toHaveBeenCalled();
  });

  it("rejects empty-string rangeX / rangeY", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    const rx = await tool.execute({ count: "1", height: "30", rangeX: "" });
    expect(rx.isError).toBe(true);
    const ry = await tool.execute({
      count: "1",
      height: "30",
      rangeY: "   ",
    });
    expect(ry.isError).toBe(true);
    expect(addHill).not.toHaveBeenCalled();
  });

  it("treats null/undefined rangeX / rangeY as defaults", async () => {
    const { runtime, addHill } = makeRuntime();
    const tool = createAddHillTool(runtime);
    const result = await tool.execute({
      count: "1",
      height: "30",
      rangeX: null,
      rangeY: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(addHill).toHaveBeenCalledWith(
      "1",
      "30",
      DEFAULT_RANGE_X,
      DEFAULT_RANGE_Y,
    );
  });

  it("surfaces runtime errors", async () => {
    const runtime: AddHillRuntime = {
      addHill: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createAddHillTool(runtime);
    const result = await tool.execute({ count: "1", height: "30" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as addHillTool with the expected name and required params", () => {
    expect(addHillTool.name).toBe("add_hill");
    expect(addHillTool.input_schema.type).toBe("object");
    expect(addHillTool.input_schema.required).toEqual(["count", "height"]);
  });
});

describe("defaultAddHillRuntime (integration)", () => {
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
      addHill() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() =>
      defaultAddHillRuntime.addHill("1", "30", "20-80", "20-80"),
    ).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() =>
      defaultAddHillRuntime.addHill("1", "30", "20-80", "20-80"),
    ).toThrow(/HeightmapGenerator/);
  });

  it("calls setGraph → addHill → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [10, 20, 30, 40];
    const afterH = [10, 25, 30, 42];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [string, string, string, string] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      addHill(count: string, height: string, rangeX: string, rangeY: string) {
        calls.push("addHill");
        latestArgs = [count, height, rangeX, rangeY];
      },
      getHeights() {
        calls.push("getHeights");
        return afterH;
      },
    } as unknown as object;

    const { cellsChanged } = defaultAddHillRuntime.addHill(
      "2",
      "40",
      "25-75",
      "10-90",
    );

    expect(calls).toEqual(["setGraph", "addHill", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual(["2", "40", "25-75", "10-90"]);
    expect(grid.cells.h).toBe(afterH);
    // (10→10 no), (20→25 yes), (30→30 no), (40→42 yes) = 2 changes
    expect(cellsChanged).toBe(2);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      addHill() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() =>
      defaultAddHillRuntime.addHill("1", "30", "20-80", "20-80"),
    ).toThrow(/getHeights/);
  });
});
