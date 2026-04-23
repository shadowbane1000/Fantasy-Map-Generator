import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModifyHeightmapTool,
  defaultModifyHeightmapRuntime,
  type ModifyHeightmapRuntime,
  modifyHeightmapTool,
} from "./modify-heightmap";

function makeRuntime(cellsChanged = 17) {
  const modify = vi.fn<ModifyHeightmapRuntime["modify"]>(() => ({
    cellsChanged,
  }));
  const runtime: ModifyHeightmapRuntime = { modify };
  return { runtime, modify };
}

describe("modify_heightmap tool", () => {
  it("passes range string and applies defaults for add/mult/power", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    const result = await tool.execute({ range: "20-100", add: 5 });
    expect(result.isError).toBeFalsy();
    expect(modify).toHaveBeenCalledWith("20-100", 5, 1, undefined);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      range: "20-100",
      add: 5,
      mult: 1,
      cellsChanged: 17,
    });
    expect(body.power).toBeUndefined();
  });

  it("coerces numeric range to string", async () => {
    const { runtime, modify } = makeRuntime(3);
    const tool = createModifyHeightmapTool(runtime);
    const result = await tool.execute({ range: 50, mult: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(modify).toHaveBeenCalledWith("50", 0, 0.5, undefined);
    const body = JSON.parse(result.content);
    expect(body.range).toBe("50");
    expect(body.mult).toBe(0.5);
  });

  it("forwards explicit add, mult, and power", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    const result = await tool.execute({
      range: "all",
      add: 5,
      mult: 0.5,
      power: 1.2,
    });
    expect(result.isError).toBeFalsy();
    expect(modify).toHaveBeenCalledWith("all", 5, 0.5, 1.2);
    const body = JSON.parse(result.content);
    expect(body.range).toBe("all");
    expect(body.add).toBe(5);
    expect(body.mult).toBe(0.5);
    expect(body.power).toBe(1.2);
  });

  it("accepts the 'land' range selector", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    const result = await tool.execute({ range: "land", add: -5 });
    expect(result.isError).toBeFalsy();
    expect(modify).toHaveBeenCalledWith("land", -5, 1, undefined);
  });

  it("rejects missing range", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ range: raw, add: 5 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/range/);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace range", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    for (const bad of ["", "   ", "\t"]) {
      const r = await tool.execute({ range: bad, add: 5 });
      expect(r.isError).toBe(true);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects non-string / non-number range", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    for (const bad of [true, {}, [], Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ range: bad, add: 5 });
      expect(r.isError).toBe(true);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects an identity call (no-op)", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    // All three at identity values.
    const identityCases: unknown[] = [
      { range: "all" }, // defaults only
      { range: "all", add: 0, mult: 1 },
      { range: "all", add: 0, mult: 1, power: 0 },
      { range: "all", add: 0, mult: 1, power: 1 },
    ];
    for (const input of identityCases) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/no-op|identity/i);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects non-finite add / mult / power", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    const bads = [Number.NaN, Number.POSITIVE_INFINITY, "5", true, {}];
    for (const bad of bads) {
      expect(
        (await tool.execute({ range: "all", add: bad as unknown })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ range: "all", mult: bad as unknown })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ range: "all", power: bad as unknown })).isError,
      ).toBe(true);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it("treats null/undefined add and mult as defaults", async () => {
    const { runtime, modify } = makeRuntime();
    const tool = createModifyHeightmapTool(runtime);
    const result = await tool.execute({
      range: "all",
      add: null,
      mult: undefined,
      power: 1.1,
    });
    expect(result.isError).toBeFalsy();
    expect(modify).toHaveBeenCalledWith("all", 0, 1, 1.1);
  });

  it("surfaces runtime errors", async () => {
    const runtime: ModifyHeightmapRuntime = {
      modify: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createModifyHeightmapTool(runtime);
    const result = await tool.execute({ range: "all", add: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as modifyHeightmapTool with the expected name and required params", () => {
    expect(modifyHeightmapTool.name).toBe("modify_heightmap");
    expect(modifyHeightmapTool.input_schema.type).toBe("object");
    expect(modifyHeightmapTool.input_schema.required).toEqual(["range"]);
  });
});

describe("defaultModifyHeightmapRuntime (integration)", () => {
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
      modify() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() =>
      defaultModifyHeightmapRuntime.modify("all", 5, 1, undefined),
    ).toThrow(/grid/);
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() =>
      defaultModifyHeightmapRuntime.modify("all", 5, 1, undefined),
    ).toThrow(/HeightmapGenerator/);
  });

  it("calls setGraph → modify → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [10, 20, 30, 40];
    const afterH = [15, 25, 30, 45];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [string, number, number, number | undefined] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      modify(
        range: string,
        add: number,
        mult: number,
        power: number | undefined,
      ) {
        calls.push("modify");
        latestArgs = [range, add, mult, power];
      },
      getHeights() {
        calls.push("getHeights");
        return afterH;
      },
    } as unknown as object;

    const { cellsChanged } = defaultModifyHeightmapRuntime.modify(
      "20-100",
      5,
      1,
      undefined,
    );

    expect(calls).toEqual(["setGraph", "modify", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual(["20-100", 5, 1, undefined]);
    expect(grid.cells.h).toBe(afterH);
    // (10→15), (20→25), (30→30), (40→45) = 3 changes
    expect(cellsChanged).toBe(3);
  });

  it("forwards power when provided", () => {
    const grid = { cells: { h: [10, 20] } };
    globalsRef.grid = grid as unknown as object;
    let receivedPower: number | undefined = -1;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      modify(
        _range: string,
        _add: number,
        _mult: number,
        power: number | undefined,
      ) {
        receivedPower = power;
      },
      getHeights() {
        return [10, 21];
      },
    } as unknown as object;

    defaultModifyHeightmapRuntime.modify("all", 0, 1, 1.2);
    expect(receivedPower).toBe(1.2);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      modify() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() =>
      defaultModifyHeightmapRuntime.modify("all", 5, 1, undefined),
    ).toThrow(/getHeights/);
  });
});
