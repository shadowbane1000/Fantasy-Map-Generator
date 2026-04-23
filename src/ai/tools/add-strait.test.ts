import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AddStraitRuntime,
  addStraitTool,
  createAddStraitTool,
  DEFAULT_STRAIT_DIRECTION,
  defaultAddStraitRuntime,
} from "./add-strait";

function makeRuntime(cellsChanged = 9) {
  const addStrait = vi.fn<AddStraitRuntime["addStrait"]>(() => ({
    cellsChanged,
  }));
  const runtime: AddStraitRuntime = { addStrait };
  return { runtime, addStrait };
}

describe("add_strait tool", () => {
  it("passes a string width straight through with default direction", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    const result = await tool.execute({ width: "2-7" });
    expect(result.isError).toBeFalsy();
    expect(addStrait).toHaveBeenCalledWith("2-7", DEFAULT_STRAIT_DIRECTION);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      width: "2-7",
      direction: DEFAULT_STRAIT_DIRECTION,
      cellsChanged: 9,
    });
  });

  it("coerces numeric width to string", async () => {
    const { runtime, addStrait } = makeRuntime(5);
    const tool = createAddStraitTool(runtime);
    const result = await tool.execute({ width: 4 });
    expect(result.isError).toBeFalsy();
    expect(addStrait).toHaveBeenCalledWith("4", "vertical");
    const body = JSON.parse(result.content);
    expect(body.width).toBe("4");
    expect(body.cellsChanged).toBe(5);
  });

  it("forwards explicit direction", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    const result = await tool.execute({
      width: "3",
      direction: "horizontal",
    });
    expect(result.isError).toBeFalsy();
    expect(addStrait).toHaveBeenCalledWith("3", "horizontal");
    const body = JSON.parse(result.content);
    expect(body.direction).toBe("horizontal");
  });

  it("normalizes case and whitespace on direction", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    const result = await tool.execute({
      width: "3",
      direction: "  HORIZONTAL ",
    });
    expect(result.isError).toBeFalsy();
    expect(addStrait).toHaveBeenCalledWith("3", "horizontal");
  });

  it("treats null/undefined direction as default 'vertical'", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    for (const raw of [undefined, null]) {
      addStrait.mockClear();
      const result = await tool.execute({ width: "3", direction: raw });
      expect(result.isError).toBeFalsy();
      expect(addStrait).toHaveBeenCalledWith("3", "vertical");
    }
  });

  it("rejects missing width", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    for (const raw of [undefined, null]) {
      const r = await tool.execute({ width: raw });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/width/);
    }
    expect(addStrait).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-scalar width", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      true,
      {},
      [],
    ]) {
      const r = await tool.execute({ width: bad });
      expect(r.isError).toBe(true);
    }
    expect(addStrait).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace string width", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    for (const bad of ["", "   ", "\t"]) {
      const r = await tool.execute({ width: bad });
      expect(r.isError).toBe(true);
    }
    expect(addStrait).not.toHaveBeenCalled();
  });

  it("rejects unknown direction values", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    for (const bad of ["diagonal", "north", "", "  "]) {
      const r = await tool.execute({ width: "3", direction: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/direction/);
    }
    expect(addStrait).not.toHaveBeenCalled();
  });

  it("rejects non-string direction", async () => {
    const { runtime, addStrait } = makeRuntime();
    const tool = createAddStraitTool(runtime);
    for (const bad of [1, true, {}, []]) {
      const r = await tool.execute({ width: "3", direction: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/direction/);
    }
    expect(addStrait).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: AddStraitRuntime = {
      addStrait: vi.fn(() => {
        throw new Error("window.grid is not available yet");
      }),
    };
    const tool = createAddStraitTool(runtime);
    const result = await tool.execute({ width: "3" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("is exported as addStraitTool with the expected name and required params", () => {
    expect(addStraitTool.name).toBe("add_strait");
    expect(addStraitTool.input_schema.type).toBe("object");
    expect(addStraitTool.input_schema.required).toEqual(["width"]);
  });
});

describe("defaultAddStraitRuntime (integration)", () => {
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
      addStrait() {},
      getHeights() {
        return [];
      },
    } as unknown as object;
    expect(() => defaultAddStraitRuntime.addStrait("3", "vertical")).toThrow(
      /grid/,
    );
  });

  it("throws when HeightmapGenerator is missing", () => {
    globalsRef.grid = { cells: { h: [1, 2, 3] } } as unknown as object;
    globalsRef.HeightmapGenerator = undefined;
    expect(() => defaultAddStraitRuntime.addStrait("3", "vertical")).toThrow(
      /HeightmapGenerator/,
    );
  });

  it("calls setGraph → addStrait → getHeights and updates grid.cells.h", () => {
    const calls: string[] = [];
    const originalH = [50, 60, 70, 80];
    const afterH = [50, 40, 70, 55];

    const grid = { cells: { h: [...originalH] } };
    globalsRef.grid = grid as unknown as object;

    let latestGraph: unknown = null;
    let latestArgs: [string, string] | null = null;
    globalsRef.HeightmapGenerator = {
      setGraph(graph: unknown) {
        calls.push("setGraph");
        latestGraph = graph;
      },
      addStrait(width: string, direction: string) {
        calls.push("addStrait");
        latestArgs = [width, direction];
      },
      getHeights() {
        calls.push("getHeights");
        return afterH;
      },
    } as unknown as object;

    const { cellsChanged } = defaultAddStraitRuntime.addStrait(
      "4",
      "horizontal",
    );

    expect(calls).toEqual(["setGraph", "addStrait", "getHeights"]);
    expect(latestGraph).toBe(grid);
    expect(latestArgs).toEqual(["4", "horizontal"]);
    expect(grid.cells.h).toBe(afterH);
    // (50→50 no), (60→40 yes), (70→70 no), (80→55 yes) = 2 changes
    expect(cellsChanged).toBe(2);
  });

  it("throws when getHeights returns null", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      addStrait() {},
      getHeights() {
        return null;
      },
    } as unknown as object;

    expect(() => defaultAddStraitRuntime.addStrait("3", "vertical")).toThrow(
      /getHeights/,
    );
  });

  it("throws when HeightmapGenerator is missing required methods", () => {
    globalsRef.grid = { cells: { h: [1, 2] } } as unknown as object;
    // Missing `addStrait`
    globalsRef.HeightmapGenerator = {
      setGraph() {},
      getHeights() {
        return [];
      },
    } as unknown as object;

    expect(() => defaultAddStraitRuntime.addStrait("3", "vertical")).toThrow(
      /HeightmapGenerator/,
    );
  });
});
