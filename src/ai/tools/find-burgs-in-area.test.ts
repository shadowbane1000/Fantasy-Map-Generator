import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsInAreaTool,
  DEFAULT_FIND_BURGS_IN_AREA_LIMIT,
  defaultFindBurgsInAreaRuntime,
  type FindBurgsInAreaResult,
  type FindBurgsInAreaRuntime,
  findBurgsInAreaInPack,
  findBurgsInAreaTool,
  MAX_FIND_BURGS_IN_AREA_LIMIT,
} from "./find-burgs-in-area";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    removed?: boolean;
  }>;
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsInAreaInPack>[0];
}

function makePack(): FakePack {
  // Burgs arranged around (100, 100) with known offsets.
  //   i=0: placeholder
  //   i=1: (100, 100) — center hit
  //   i=2: (103, 104) — distance 5
  //   i=3: (110, 100) — distance 10 exact
  //   i=4: (100, 110) — distance 10 exact
  //   i=5: (115, 115) — ~21.2
  //   i=6: (200, 200) — far away
  //   i=7: removed=true (would match otherwise)
  //   i=8: missing coords
  //   i=9: (50, 50)
  return {
    burgs: [
      { i: 0 },
      { i: 1, name: "Core", x: 100, y: 100 },
      { i: 2, name: "North", x: 103, y: 104 },
      { i: 3, name: "East", x: 110, y: 100 },
      { i: 4, name: "South", x: 100, y: 110 },
      { i: 5, name: "Edge", x: 115, y: 115 },
      { i: 6, name: "Far", x: 200, y: 200 },
      { i: 7, name: "Gone", x: 100, y: 100, removed: true },
      { i: 8, name: "NoCoord" },
      { i: 9, name: "Corner", x: 50, y: 50 },
    ],
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      p: [
        [0, 0],
        [100, 100],
        [103, 104],
        [110, 100],
        [100, 110],
        [115, 115],
        [200, 200],
        undefined, // cell 7 has no point
        [0, 0],
        [50, 50],
      ],
    },
  };
}

function runtimeReturning(
  result: FindBurgsInAreaResult,
): FindBurgsInAreaRuntime {
  return { find: () => result };
}

describe("find_burgs_in_area — pure / seam", () => {
  it("rectangle returns every active burg inside the box (inclusive edges)", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { burgs: Array<{ i: number }>; count: number; area: unknown };
    const ids = new Set(result.burgs.map((b) => b.i));
    // (100,100), (103,104), (110,100), (100,110) — burg 5 is (115,115) excluded,
    // burg 7 is removed, burg 9 is (50,50) excluded.
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
  });

  it("rectangle normalises reversed corners", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 110,
      y1: 110,
      x2: 100,
      y2: 100,
      limit: 100,
    }) as {
      burgs: Array<{ i: number }>;
      area: { x1: number; x2: number; y1: number; y2: number };
    };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.area.x1).toBe(100);
    expect(result.area.x2).toBe(110);
    expect(result.area.y1).toBe(100);
    expect(result.area.y2).toBe(110);
  });

  it("rectangle burg distance is null", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as { burgs: Array<{ distance: number | null }> };
    for (const b of result.burgs) expect(b.distance).toBeNull();
  });

  it("circle-coords returns every burg inside radius with distance", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      burgs: Array<{ i: number; distance: number | null }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.burgs.map((b) => b.i));
    // radius 10 from (100,100): 1 (0), 2 (5), 3 (10 exact), 4 (10 exact)
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const b of result.burgs) {
      expect(typeof b.distance).toBe("number");
      expect(b.distance).toBeLessThanOrEqual(10);
    }
  });

  it("circle-cell resolves center via pack.cells.p[cell]", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      burgs: Array<{ i: number }>;
      count: number;
      area: { x: number; y: number; radius: number };
    };
    // cells.p[1] = (100,100). Radius 5 hits burg 1 (0) and burg 2 (5).
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({ kind: "circle", x: 100, y: 100, radius: 5 });
  });

  it("radius 0 returns only burgs exactly at center", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as { burgs: Array<{ i: number }>; count: number };
    expect(result.burgs.map((b) => b.i)).toEqual([1]);
    expect(result.count).toBe(1);
  });

  it("limit truncates burgs but count reports full total", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    }) as { burgs: Array<{ i: number }>; count: number };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("skips i=0 placeholder, removed burgs, and burgs without coords", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      limit: 100,
    }) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // no coords
    // Active valid burgs: 1,2,3,4,5,6,9 = 7 total
    expect(result.count).toBe(7);
  });

  it("returns empty list and count 0 when no burgs match", () => {
    const result = findBurgsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 9999,
      y: 9999,
      radius: 1,
      limit: 100,
    }) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns 'not-ready' when pack or pack.burgs is missing", () => {
    expect(
      findBurgsInAreaInPack(undefined, {
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findBurgsInAreaInPack(
        {} as unknown as Parameters<typeof findBurgsInAreaInPack>[0],
        { kind: "rect", x1: 0, y1: 0, x2: 1, y2: 1, limit: 100 },
      ),
    ).toBe("not-ready");
  });

  it("circle-cell returns 'out-of-bounds' when cell >= cells.i.length", () => {
    expect(
      findBurgsInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 999,
        radius: 10,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("circle-cell returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findBurgsInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 7,
        radius: 10,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_burgs_in_area — tool surface", () => {
  function realRuntime(): FindBurgsInAreaRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findBurgsInAreaInPack(pack, q),
    };
  }

  it("rejects when no area supplied", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/either a rectangle/i);
  });

  it("rejects when rectangle and circle params mixed", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      radius: 5,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not both/i);
  });

  it("rejects incomplete rectangle", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 10 }, // y2 missing
      { x1: 0, y1: 0, y2: 10 }, // x2 missing
      { x1: 0, x2: 10, y2: 10 }, // y1 missing
      { y1: 0, x2: 10, y2: 10 }, // x1 missing
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/rectangle requires/i);
    }
  });

  it("rejects non-finite rectangle corners", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    for (const bad of [
      { x1: "0", y1: 0, x2: 10, y2: 10 },
      { x1: 0, y1: Number.NaN, x2: 10, y2: 10 },
      { x1: 0, y1: 0, x2: Number.POSITIVE_INFINITY, y2: 10 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite numbers/i);
    }
  });

  it("rejects circle with both (x,y) and cell", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const r = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not both/i);
  });

  it("rejects circle with neither center form", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const r = await tool.execute({ radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/center/i);
  });

  it("rejects circle missing y (or x) when the other is supplied", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    for (const bad of [
      { x: "1", y: 2, radius: 5 },
      { x: 1, y: Number.NaN, radius: 5 },
      { x: Number.POSITIVE_INFINITY, y: 1, radius: 5 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite/i);
    }
  });

  it("rejects non-integer / negative cell", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
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

  it("rejects missing / non-finite / negative radius on circle query", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
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
    const tool = createFindBurgsInAreaTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.burgs).toEqual([
      { i: 1, name: "Core", x: 100, y: 100, distance: 0 },
    ]);
    expect(body.count).toBe(1);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 0,
    });
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 0 },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: MAX_FIND_BURGS_IN_AREA_LIMIT + 1 },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 1.5 },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: "10" },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindBurgsInAreaTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindBurgsInAreaTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindBurgsInAreaTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 3, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/3/);
  });

  it("returns ok with rectangle results and echoes area", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    for (const b of body.burgs) expect(b.distance).toBeNull();
  });

  it("returns ok with circle results (distance populated)", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const b of body.burgs) expect(typeof b.distance).toBe("number");
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindBurgsInAreaTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("is exported as findBurgsInAreaTool with the expected schema", () => {
    expect(findBurgsInAreaTool.name).toBe("find_burgs_in_area");
    expect(findBurgsInAreaTool.input_schema.type).toBe("object");
    expect(findBurgsInAreaTool.input_schema.required).toBeUndefined();
    expect(findBurgsInAreaTool.input_schema.properties.x1).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.y1).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.x2).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.y2).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.x).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.y).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.cell).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.radius).toBeDefined();
    expect(findBurgsInAreaTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_BURGS_IN_AREA_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_IN_AREA_LIMIT).toBe(100000);
  });
});

// ----- defaultFindBurgsInAreaRuntime integration -----

describe("defaultFindBurgsInAreaRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a rectangle query", () => {
    const result = defaultFindBurgsInAreaRuntime.find({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.count).toBe(4);
  });

  it("reads real pack via default runtime for a circle-coords query", () => {
    const result = defaultFindBurgsInAreaRuntime.find({
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      burgs: Array<{ i: number; distance: number | null }>;
      area: unknown;
    };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
  });

  it("reads real pack via default runtime for a circle-cell query", () => {
    const result = defaultFindBurgsInAreaRuntime.find({
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as { burgs: Array<{ i: number }>; area: { x: number; y: number } };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 5,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindBurgsInAreaRuntime.find({
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findBurgsInAreaTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
