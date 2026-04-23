import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindRiversInAreaTool,
  DEFAULT_FIND_RIVERS_IN_AREA_LIMIT,
  defaultFindRiversInAreaRuntime,
  type FindRiversInAreaResult,
  type FindRiversInAreaRuntime,
  findRiversInAreaInPack,
  findRiversInAreaTool,
  MAX_FIND_RIVERS_IN_AREA_LIMIT,
} from "./find-rivers-in-area";

interface FakePack {
  rivers: Array<{
    i: number;
    name?: string;
    mouth?: number;
    source?: number;
    removed?: boolean;
  }>;
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findRiversInAreaInPack>[0];
}

function makePack(): FakePack {
  // Mouths arranged around (100, 100) with known offsets.
  //   i=1: mouth cell 1 → (100, 100) — center hit
  //   i=2: mouth cell 2 → (103, 104) — distance 5
  //   i=3: mouth cell 3 → (110, 100) — distance 10 exact
  //   i=4: mouth cell 4 → (100, 110) — distance 10 exact
  //   i=5: mouth cell 5 → (115, 115) — ~21.2
  //   i=6: mouth cell 6 → (200, 200) — far away
  //   i=7: removed=true (would match otherwise)
  //   i=8: mouth cell 7 → undefined → filtered out
  //   i=9: no mouth at all → filtered out
  //   i=10: mouth cell 9 → (50, 50)
  //   index 0 placeholder → filtered out (i === 0)
  return {
    rivers: [
      { i: 0, name: "placeholder", mouth: 0 },
      { i: 1, name: "Alpha", mouth: 1, source: 8 },
      { i: 2, name: "Beta", mouth: 2, source: 8 },
      { i: 3, name: "Gamma", mouth: 3 },
      { i: 4, name: "Delta", mouth: 4 },
      { i: 5, name: "Epsilon", mouth: 5 },
      { i: 6, name: "Zeta", mouth: 6 },
      { i: 7, name: "Eta", mouth: 1, removed: true },
      { i: 8, name: "Theta", mouth: 7 }, // cell 7 has no coords
      { i: 9, name: "Iota" }, // no mouth
      { i: 10, name: "Kappa", mouth: 9 },
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
  result: FindRiversInAreaResult,
): FindRiversInAreaRuntime {
  return { find: () => result };
}

describe("find_rivers_in_area — pure / seam", () => {
  it("rectangle returns every active river whose mouth is in the box (inclusive edges)", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { rivers: Array<{ i: number }>; count: number; area: unknown };
    const ids = new Set(result.rivers.map((r) => r.i));
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
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 110,
      y1: 110,
      x2: 100,
      y2: 100,
      limit: 100,
    }) as {
      rivers: Array<{ i: number }>;
      area: { x1: number; x2: number; y1: number; y2: number };
    };
    const ids = new Set(result.rivers.map((r) => r.i));
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.area.x1).toBe(100);
    expect(result.area.x2).toBe(110);
    expect(result.area.y1).toBe(100);
    expect(result.area.y2).toBe(110);
  });

  it("rectangle river distance is null", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as { rivers: Array<{ distance: number | null }> };
    for (const r of result.rivers) expect(r.distance).toBeNull();
  });

  it("circle-coords returns every river whose mouth is inside radius with distance", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      rivers: Array<{ i: number; distance: number | null }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.rivers.map((r) => r.i));
    // radius 10 from (100,100): 1 (0), 2 (5), 3 (10 exact), 4 (10 exact)
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const r of result.rivers) {
      expect(typeof r.distance).toBe("number");
      expect(r.distance).toBeLessThanOrEqual(10);
    }
  });

  it("circle-cell resolves center via pack.cells.p[cell]", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      rivers: Array<{ i: number }>;
      count: number;
      area: { x: number; y: number; radius: number };
    };
    // cells.p[1] = (100,100). Radius 5 hits river 1 (0) and river 2 (5).
    const ids = new Set(result.rivers.map((r) => r.i));
    expect(ids).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({ kind: "circle", x: 100, y: 100, radius: 5 });
  });

  it("radius 0 returns only rivers whose mouth is exactly at the center", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as { rivers: Array<{ i: number }>; count: number };
    expect(result.rivers.map((r) => r.i)).toEqual([1]);
    expect(result.count).toBe(1);
  });

  it("limit truncates rivers but count reports full total", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    }) as { rivers: Array<{ i: number }>; count: number };
    expect(result.rivers.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("skips removed rivers, rivers with no mouth, rivers whose mouth cell has no coords, and the index-0 placeholder", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      limit: 100,
    }) as { rivers: Array<{ i: number }>; count: number };
    const ids = new Set(result.rivers.map((r) => r.i));
    expect(ids.has(0)).toBe(false); // placeholder
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // mouth cell has no coords
    expect(ids.has(9)).toBe(false); // no mouth
    // Active, coord-bearing rivers: 1,2,3,4,5,6,10 = 7 total.
    expect(ids).toEqual(new Set([1, 2, 3, 4, 5, 6, 10]));
    expect(result.count).toBe(7);
  });

  it("river.x / river.y come from the mouth cell centroid", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 99,
      y1: 99,
      x2: 104,
      y2: 105,
      limit: 100,
    }) as {
      rivers: Array<{ i: number; x: number; y: number; name: string }>;
    };
    const byId = new Map(result.rivers.map((r) => [r.i, r]));
    expect(byId.get(1)).toMatchObject({ x: 100, y: 100, name: "Alpha" });
    expect(byId.get(2)).toMatchObject({ x: 103, y: 104, name: "Beta" });
  });

  it("returns empty list and count 0 when no rivers match", () => {
    const result = findRiversInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 9999,
      y: 9999,
      radius: 1,
      limit: 100,
    }) as { rivers: unknown[]; count: number };
    expect(result.rivers).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns 'not-ready' when pack or pack.rivers is missing", () => {
    expect(
      findRiversInAreaInPack(undefined, {
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findRiversInAreaInPack(
        {} as unknown as Parameters<typeof findRiversInAreaInPack>[0],
        {
          kind: "rect",
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          limit: 100,
        },
      ),
    ).toBe("not-ready");
  });

  it("circle-cell returns 'out-of-bounds' when cell >= cells.i.length", () => {
    expect(
      findRiversInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 999,
        radius: 10,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("circle-cell returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findRiversInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 7,
        radius: 10,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_rivers_in_area — tool surface", () => {
  function realRuntime(): FindRiversInAreaRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findRiversInAreaInPack(pack, q),
    };
  }

  it("rejects when no area supplied", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/either a rectangle/i);
  });

  it("rejects when rectangle and circle params mixed", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
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
    const tool = createFindRiversInAreaTool(realRuntime());
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
    const tool = createFindRiversInAreaTool(realRuntime());
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
    const tool = createFindRiversInAreaTool(realRuntime());
    const r = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not both/i);
  });

  it("rejects circle with neither center form", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
    const r = await tool.execute({ radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/center/i);
  });

  it("rejects circle missing y (or x) when the other is supplied", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
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
    const tool = createFindRiversInAreaTool(realRuntime());
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
    const tool = createFindRiversInAreaTool(realRuntime());
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
    const tool = createFindRiversInAreaTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.rivers).toEqual([
      { i: 1, name: "Alpha", x: 100, y: 100, distance: 0 },
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
    const tool = createFindRiversInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 0 },
      {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        limit: MAX_FIND_RIVERS_IN_AREA_LIMIT + 1,
      },
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
    const tool = createFindRiversInAreaTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindRiversInAreaTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindRiversInAreaTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 3, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/3/);
  });

  it("returns ok with rectangle results and echoes area", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.rivers.map((r: { i: number }) => r.i))).toEqual(
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
    for (const r of body.rivers) expect(r.distance).toBeNull();
  });

  it("returns ok with circle results (distance populated)", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.rivers.map((r: { i: number }) => r.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const r of body.rivers) expect(typeof r.distance).toBe("number");
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindRiversInAreaTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.rivers.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("is exported as findRiversInAreaTool with the expected schema", () => {
    expect(findRiversInAreaTool.name).toBe("find_rivers_in_area");
    expect(findRiversInAreaTool.input_schema.type).toBe("object");
    expect(findRiversInAreaTool.input_schema.required).toBeUndefined();
    expect(findRiversInAreaTool.input_schema.properties.x1).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.y1).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.x2).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.y2).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.x).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.y).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.cell).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.radius).toBeDefined();
    expect(findRiversInAreaTool.input_schema.properties.limit).toBeDefined();
    // No `type` filter — mouths don't have a meaningful type for area
    // filtering (callers can post-filter via list_rivers).
    expect(findRiversInAreaTool.input_schema.properties.type).toBeUndefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_RIVERS_IN_AREA_LIMIT).toBe(10000);
    expect(MAX_FIND_RIVERS_IN_AREA_LIMIT).toBe(100000);
  });
});

// ----- defaultFindRiversInAreaRuntime integration -----

describe("defaultFindRiversInAreaRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a rectangle query", () => {
    const result = defaultFindRiversInAreaRuntime.find({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { rivers: Array<{ i: number }>; count: number };
    expect(new Set(result.rivers.map((r) => r.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.count).toBe(4);
  });

  it("reads real pack via default runtime for a circle-coords query", () => {
    const result = defaultFindRiversInAreaRuntime.find({
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      rivers: Array<{ i: number; distance: number | null }>;
      area: unknown;
    };
    expect(new Set(result.rivers.map((r) => r.i))).toEqual(
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
    const result = defaultFindRiversInAreaRuntime.find({
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as { rivers: Array<{ i: number }>; area: { x: number; y: number } };
    expect(new Set(result.rivers.map((r) => r.i))).toEqual(new Set([1, 2]));
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
      defaultFindRiversInAreaRuntime.find({
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findRiversInAreaTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
