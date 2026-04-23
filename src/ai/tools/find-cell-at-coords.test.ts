import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellAtCoordsTool,
  defaultFindCellRuntime,
  type FindCellResult,
  type FindCellRuntime,
  findCellAtCoordsTool,
  scanPackForNearestCell,
} from "./find-cell-at-coords";

function runtimeReturning(result: FindCellResult): FindCellRuntime {
  return { findCell: () => result };
}

function capturingRuntime(result: FindCellResult): {
  runtime: FindCellRuntime;
  calls: Array<[number, number]>;
} {
  const calls: Array<[number, number]> = [];
  const runtime: FindCellRuntime = {
    findCell(x, y) {
      calls.push([x, y]);
      return result;
    },
  };
  return { runtime, calls };
}

describe("find_cell_at_coords tool — pure / seam", () => {
  it("returns ok with cell, x, y for a valid lookup", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(42));
    const result = await tool.execute({ x: 120, y: 340 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.cell).toBe(42);
    expect(body.x).toBe(120);
    expect(body.y).toBe(340);
  });

  it("echoes the requested x / y back in the response", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(7));
    const r = await tool.execute({ x: 3.5, y: -4.25 });
    const body = JSON.parse(r.content);
    expect(body.x).toBe(3.5);
    expect(body.y).toBe(-4.25);
  });

  it("passes the coordinates through to the runtime unchanged", async () => {
    const { runtime, calls } = capturingRuntime(1);
    const tool = createFindCellAtCoordsTool(runtime);
    await tool.execute({ x: 10, y: 20 });
    expect(calls).toEqual([[10, 20]]);
  });

  it("errors when the runtime returns null (no cell found)", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(null));
    const r = await tool.execute({ x: 0, y: 0 });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/no cell found/i);
    expect(body.x).toBe(0);
    expect(body.y).toBe(0);
  });

  it("errors with 'not ready' when the runtime reports 'not-ready'", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("rejects missing x", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(0));
    const r = await tool.execute({ y: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/x is required/i);
  });

  it("rejects missing y", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(0));
    const r = await tool.execute({ x: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/y is required/i);
  });

  it("rejects non-numeric x / y", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(0));
    for (const bad of [
      { x: "1", y: 2 },
      { x: 1, y: "2" },
      { x: true, y: 2 },
      { x: 1, y: null },
      { x: {}, y: 2 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite number/i);
    }
  });

  it("rejects non-finite x / y (NaN, Infinity, -Infinity)", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(0));
    for (const bad of [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.NaN },
      { x: Number.POSITIVE_INFINITY, y: 0 },
      { x: 0, y: Number.NEGATIVE_INFINITY },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite number/i);
    }
  });

  it("accepts negative coordinates (passes through to runtime)", async () => {
    const { runtime, calls } = capturingRuntime(5);
    const tool = createFindCellAtCoordsTool(runtime);
    const r = await tool.execute({ x: -50, y: -25 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.cell).toBe(5);
    expect(calls).toEqual([[-50, -25]]);
  });

  it("accepts zero coordinates", async () => {
    const tool = createFindCellAtCoordsTool(runtimeReturning(0));
    const r = await tool.execute({ x: 0, y: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.cell).toBe(0);
  });

  it("is exported as findCellAtCoordsTool with the expected schema", () => {
    expect(findCellAtCoordsTool.name).toBe("find_cell_at_coords");
    expect(findCellAtCoordsTool.input_schema.type).toBe("object");
    expect(findCellAtCoordsTool.input_schema.required).toEqual(["x", "y"]);
    expect(findCellAtCoordsTool.input_schema.properties.x).toBeDefined();
    expect(findCellAtCoordsTool.input_schema.properties.y).toBeDefined();
  });
});

describe("scanPackForNearestCell — helper", () => {
  it("returns the index of the closest point by squared distance", () => {
    const pack = {
      cells: {
        p: [
          [0, 0],
          [100, 100],
          [50, 50],
        ] as Array<[number, number]>,
      },
    };
    expect(scanPackForNearestCell(pack, 45, 55)).toBe(2);
    expect(scanPackForNearestCell(pack, 5, 5)).toBe(0);
    expect(scanPackForNearestCell(pack, 90, 95)).toBe(1);
  });

  it("returns 'not-ready' when pack.cells.p is missing", () => {
    expect(scanPackForNearestCell(undefined, 0, 0)).toBe("not-ready");
    expect(scanPackForNearestCell({}, 0, 0)).toBe("not-ready");
    expect(scanPackForNearestCell({ cells: {} }, 0, 0)).toBe("not-ready");
  });

  it("returns null when pack.cells.p is empty", () => {
    expect(scanPackForNearestCell({ cells: { p: [] } }, 0, 0)).toBe(null);
  });
});

// ----- defaultFindCellRuntime integration -----

describe("defaultFindCellRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    findCell?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalFindCell = globalsRef.findCell;

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.findCell = originalFindCell;
  });

  it("resolves through globalThis.findCell when present", () => {
    const calls: Array<[number, number]> = [];
    globalsRef.findCell = ((x: number, y: number) => {
      calls.push([x, y]);
      return 17;
    }) as unknown;
    globalsRef.pack = undefined;
    expect(defaultFindCellRuntime.findCell(4, 8)).toBe(17);
    expect(calls).toEqual([[4, 8]]);
  });

  it("treats undefined from globalThis.findCell as null", () => {
    globalsRef.findCell = (() => undefined) as unknown;
    globalsRef.pack = undefined;
    expect(defaultFindCellRuntime.findCell(1, 2)).toBe(null);
  });

  it("falls back to scanning pack.cells.p when findCell global is missing", () => {
    globalsRef.findCell = undefined;
    globalsRef.pack = {
      cells: {
        p: [
          [0, 0],
          [200, 200],
          [75, 75],
        ],
      },
    } as unknown;
    expect(defaultFindCellRuntime.findCell(70, 80)).toBe(2);
    expect(defaultFindCellRuntime.findCell(5, 5)).toBe(0);
  });

  it("falls back to scan when findCell throws (map not ready)", () => {
    globalsRef.findCell = (() => {
      throw new Error("Pack cells not found");
    }) as unknown;
    globalsRef.pack = undefined;
    expect(defaultFindCellRuntime.findCell(1, 2)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack and findCell are both missing", () => {
    globalsRef.findCell = undefined;
    globalsRef.pack = undefined;
    expect(defaultFindCellRuntime.findCell(0, 0)).toBe("not-ready");
  });
});

describe("findCellAtCoordsTool end-to-end (default runtime)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    findCell?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalFindCell = globalsRef.findCell;

  beforeEach(() => {
    globalsRef.findCell = undefined;
    globalsRef.pack = {
      cells: {
        p: [
          [10, 10],
          [100, 100],
          [500, 500],
        ],
      },
    } as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.findCell = originalFindCell;
  });

  it("returns cell 1 for a coordinate near (100, 100)", async () => {
    const r = await findCellAtCoordsTool.execute({ x: 110, y: 105 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.cell).toBe(1);
    expect(body.x).toBe(110);
    expect(body.y).toBe(105);
  });

  it("returns 'not ready' error when pack is missing", async () => {
    globalsRef.pack = undefined;
    const r = await findCellAtCoordsTool.execute({ x: 0, y: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });
});
