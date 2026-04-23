import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsInRadiusTool,
  DEFAULT_FIND_CELLS_IN_RADIUS_LIMIT,
  defaultFindCellsInRadiusRuntime,
  type FindCellsInRadiusResult,
  type FindCellsInRadiusRuntime,
  findCellsInRadiusInPack,
  findCellsInRadiusTool,
  MAX_FIND_CELLS_IN_RADIUS_LIMIT,
} from "./find-cells-in-radius";

interface FakePack {
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findCellsInRadiusInPack>[0];
}

function makePack(): FakePack {
  // 9 cells arranged around (100, 100) at known offsets.
  // distances from (100, 100):
  //   0: (100, 100)   dist 0
  //   1: (103, 104)   dist 5 (3-4-5)
  //   2: (110, 100)   dist 10
  //   3: (100, 110)   dist 10
  //   4: (107, 107)   ~9.9
  //   5: (115, 115)   ~21.2
  //   6: (200, 200)   ~141.4
  //   7: undefined slot
  //   8: (50, 50)     ~70.7
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      p: [
        [100, 100],
        [103, 104],
        [110, 100],
        [100, 110],
        [107, 107],
        [115, 115],
        [200, 200],
        undefined,
        [50, 50],
      ],
    },
  };
}

function runtimeReturning(
  result: FindCellsInRadiusResult,
): FindCellsInRadiusRuntime {
  return { find: () => result };
}

describe("find_cells_in_radius — pure / seam", () => {
  it("coordinate query returns every cell inside the radius", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as { cells: number[]; count: number; center: { x: number; y: number } };
    // radius 10 includes cells 0 (0), 1 (5), 2 (10 exact), 3 (10 exact), 4 (~9.9)
    expect(new Set(result.cells)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(result.count).toBe(5);
    expect(result.center).toEqual({ x: 100, y: 100 });
  });

  it("cell-form resolves pack.cells.p[cell] as center", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "cell",
      cell: 0,
      radius: 5,
      limit: 100,
    }) as { cells: number[]; count: number; center: { x: number; y: number } };
    // radius 5 from (100,100) includes 0 (0) and 1 (5 exact).
    expect(new Set(result.cells)).toEqual(new Set([0, 1]));
    expect(result.count).toBe(2);
    expect(result.center).toEqual({ x: 100, y: 100 });
  });

  it("radius 0 returns only cells exactly at center", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as { cells: number[]; count: number };
    expect(result.cells).toEqual([0]);
    expect(result.count).toBe(1);
  });

  it("radius 0 with no cell at center returns empty list", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "coords",
      x: 999,
      y: 999,
      radius: 0,
      limit: 100,
    }) as { cells: number[]; count: number };
    expect(result.cells).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("boundary cells exactly on the radius are included", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as { cells: number[] };
    // Cell 2 at (110, 100) is exactly radius 10 away — must be included.
    expect(result.cells).toContain(2);
    expect(result.cells).toContain(3);
  });

  it("limit truncates cells but count reports full total", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    }) as { cells: number[]; count: number };
    expect(result.cells.length).toBe(2);
    expect(result.count).toBe(5);
  });

  it("skips undefined entries in pack.cells.p", () => {
    const pack = makePack();
    // Put the undefined slot inside radius of a coord query — scanner
    // must skip it, not crash.
    pack.cells.p[7] = undefined;
    const result = findCellsInRadiusInPack(asPack(pack), {
      kind: "coords",
      x: 100,
      y: 100,
      radius: 1000,
      limit: 100,
    }) as { cells: number[]; count: number };
    expect(result.cells).not.toContain(7);
    // 8 valid cells out of 9 (index 7 is undefined).
    expect(result.count).toBe(8);
  });

  it("returns empty result when no cells in radius", () => {
    const result = findCellsInRadiusInPack(asPack(makePack()), {
      kind: "coords",
      x: 1000,
      y: 1000,
      radius: 1,
      limit: 100,
    }) as { cells: number[]; count: number; center: { x: number; y: number } };
    expect(result.cells).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.center).toEqual({ x: 1000, y: 1000 });
  });

  it("returns 'not-ready' when pack.cells.p is missing", () => {
    expect(
      findCellsInRadiusInPack(undefined, {
        kind: "coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findCellsInRadiusInPack(
        {} as unknown as Parameters<typeof findCellsInRadiusInPack>[0],
        { kind: "coords", x: 0, y: 0, radius: 1, limit: 100 },
      ),
    ).toBe("not-ready");
    expect(
      findCellsInRadiusInPack(asPack({ cells: { i: [], p: [] } }), {
        kind: "coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toEqual({ cells: [], count: 0, center: { x: 0, y: 0 } });
  });

  it("returns 'out-of-bounds' when cell is past cells.i.length", () => {
    expect(
      findCellsInRadiusInPack(asPack(makePack()), {
        kind: "cell",
        cell: 999,
        radius: 10,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findCellsInRadiusInPack(asPack(makePack()), {
        kind: "cell",
        cell: 7,
        radius: 10,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_cells_in_radius — tool surface", () => {
  function realRuntime(): FindCellsInRadiusRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findCellsInRadiusInPack(pack, q),
    };
  }

  it("rejects when neither x/y nor cell provided", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    const result = await tool.execute({ radius: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /either \(x, y\) coordinates or a cell id/i,
    );
  });

  it("rejects when both x/y and cell are provided", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    const result = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    for (const bad of [
      { x: "1", y: 2, radius: 5 },
      { x: 1, y: "2", radius: 5 },
      { x: Number.NaN, y: 2, radius: 5 },
      { x: 1, y: Number.POSITIVE_INFINITY, radius: 5 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite/i);
    }
  });

  it("rejects missing y when x is provided (and vice versa)", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-integer or negative cell", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    for (const bad of [
      { cell: "1", radius: 5 },
      { cell: 1.5, radius: 5 },
      { cell: -1, radius: 5 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/i);
    }
  });

  it("rejects missing / non-finite / negative radius", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    for (const bad of [
      { x: 1, y: 1 },
      { x: 1, y: 1, radius: "10" },
      { x: 1, y: 1, radius: Number.NaN },
      { x: 1, y: 1, radius: Number.POSITIVE_INFINITY },
      { x: 1, y: 1, radius: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/radius/i);
    }
  });

  it("accepts radius = 0", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.cells).toEqual([0]);
    expect(body.count).toBe(1);
    expect(body.center).toEqual({ x: 100, y: 100 });
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    for (const bad of [
      { x: 0, y: 0, radius: 1, limit: 0 },
      { x: 0, y: 0, radius: 1, limit: MAX_FIND_CELLS_IN_RADIUS_LIMIT + 1 },
      { x: 0, y: 0, radius: 1, limit: 1.5 },
      { x: 0, y: 0, radius: 1, limit: "10" },
      { x: 0, y: 0, radius: 1, limit: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsInRadiusTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindCellsInRadiusTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindCellsInRadiusTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 1, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/1/);
  });

  it("returns ok=true with cells and count on happy path", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.cells)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(body.count).toBe(5);
    expect(body.center).toEqual({ x: 100, y: 100 });
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindCellsInRadiusTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells.length).toBe(2);
    expect(body.count).toBe(5);
  });

  it("is exported as findCellsInRadiusTool with the expected schema", () => {
    expect(findCellsInRadiusTool.name).toBe("find_cells_in_radius");
    expect(findCellsInRadiusTool.input_schema.type).toBe("object");
    // No top-level required[] — oneOf-style validation is done at runtime.
    expect(findCellsInRadiusTool.input_schema.required).toBeUndefined();
    expect(findCellsInRadiusTool.input_schema.properties.x).toBeDefined();
    expect(findCellsInRadiusTool.input_schema.properties.y).toBeDefined();
    expect(findCellsInRadiusTool.input_schema.properties.cell).toBeDefined();
    expect(findCellsInRadiusTool.input_schema.properties.radius).toBeDefined();
    expect(findCellsInRadiusTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_CELLS_IN_RADIUS_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_IN_RADIUS_LIMIT).toBe(100000);
  });
});

// ----- defaultFindCellsInRadiusRuntime integration -----

describe("defaultFindCellsInRadiusRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a coordinate query", () => {
    const result = defaultFindCellsInRadiusRuntime.find({
      kind: "coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as { cells: number[]; count: number; center: { x: number; y: number } };
    expect(new Set(result.cells)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(result.count).toBe(5);
    expect(result.center).toEqual({ x: 100, y: 100 });
  });

  it("reads real pack via default runtime for a cell query", () => {
    const result = defaultFindCellsInRadiusRuntime.find({
      kind: "cell",
      cell: 0,
      radius: 5,
      limit: 100,
    }) as { cells: number[]; count: number; center: { x: number; y: number } };
    expect(new Set(result.cells)).toEqual(new Set([0, 1]));
    expect(result.center).toEqual({ x: 100, y: 100 });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsInRadiusRuntime.find({
        kind: "coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findCellsInRadiusTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
