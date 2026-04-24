import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindProvincesInAreaTool,
  DEFAULT_FIND_PROVINCES_IN_AREA_LIMIT,
  defaultFindProvincesInAreaRuntime,
  type FindProvincesInAreaResult,
  type FindProvincesInAreaRuntime,
  findProvincesInAreaInPack,
  findProvincesInAreaTool,
  MAX_FIND_PROVINCES_IN_AREA_LIMIT,
} from "./find-provinces-in-area";

interface FakePack {
  provinces: Array<{
    i: number;
    name?: string;
    fullName?: string;
    color?: string;
    pole?: [number, number] | number[];
    center?: number;
    removed?: boolean;
  }>;
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findProvincesInAreaInPack>[0];
}

function makePack(): FakePack {
  // Provinces arranged around (100, 100) with known offsets.
  //   i=0: placeholder
  //   i=1: pole (100, 100) — center hit
  //   i=2: pole (103, 104) — distance 5
  //   i=3: pole (110, 100) — distance 10 exact
  //   i=4: pole (100, 110) — distance 10 exact
  //   i=5: pole (115, 115) — ~21.2
  //   i=6: pole (200, 200) — far away
  //   i=7: removed=true (would match otherwise)
  //   i=8: no pole but center=1 → cells.p[1]=(100,100) fallback
  //   i=9: no pole, no center → skipped
  //   i=10: pole (50, 50)
  return {
    provinces: [
      { i: 0 },
      {
        i: 1,
        name: "Core",
        fullName: "Core Province",
        color: "#f00",
        pole: [100, 100],
      },
      { i: 2, name: "North", pole: [103, 104] },
      { i: 3, name: "East", pole: [110, 100] },
      { i: 4, name: "South", pole: [100, 110] },
      { i: 5, name: "Edge", pole: [115, 115] },
      { i: 6, name: "Far", pole: [200, 200] },
      { i: 7, name: "Gone", pole: [100, 100], removed: true },
      { i: 8, name: "CenterFallback", center: 1 },
      { i: 9, name: "NoPos" },
      { i: 10, name: "Corner", pole: [50, 50] },
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
  result: FindProvincesInAreaResult,
): FindProvincesInAreaRuntime {
  return { find: () => result };
}

describe("find_provinces_in_area — pure / seam", () => {
  it("rectangle returns every active province inside the box (inclusive edges)", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as {
      provinces: Array<{ i: number }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.provinces.map((p) => p.i));
    // poles at (100,100), (103,104), (110,100), (100,110), and i=8 center-fallback (100,100).
    expect(ids).toEqual(new Set([1, 2, 3, 4, 8]));
    expect(result.count).toBe(5);
    expect(result.area).toEqual({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
  });

  it("rectangle normalises reversed corners", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 110,
      y1: 110,
      x2: 100,
      y2: 100,
      limit: 100,
    }) as {
      provinces: Array<{ i: number }>;
      area: { x1: number; x2: number; y1: number; y2: number };
    };
    const ids = new Set(result.provinces.map((p) => p.i));
    expect(ids).toEqual(new Set([1, 2, 3, 4, 8]));
    expect(result.area.x1).toBe(100);
    expect(result.area.x2).toBe(110);
    expect(result.area.y1).toBe(100);
    expect(result.area.y2).toBe(110);
  });

  it("rectangle province distance is null", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as { provinces: Array<{ distance: number | null }> };
    for (const p of result.provinces) expect(p.distance).toBeNull();
  });

  it("circle-coords returns every province inside radius with distance", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      provinces: Array<{ i: number; distance: number | null }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.provinces.map((p) => p.i));
    // radius 10 from (100,100): 1 (0), 2 (5), 3 (10 exact), 4 (10 exact), 8 fallback (0)
    expect(ids).toEqual(new Set([1, 2, 3, 4, 8]));
    expect(result.count).toBe(5);
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const p of result.provinces) {
      expect(typeof p.distance).toBe("number");
      expect(p.distance).toBeLessThanOrEqual(10);
    }
  });

  it("circle-cell resolves center via pack.cells.p[cell]", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      provinces: Array<{ i: number }>;
      count: number;
      area: { x: number; y: number; radius: number };
    };
    // cells.p[1] = (100,100). Radius 5 hits pole-1 (0), pole-2 (5), and i=8 center-fallback (0).
    const ids = new Set(result.provinces.map((p) => p.i));
    expect(ids).toEqual(new Set([1, 2, 8]));
    expect(result.area).toEqual({ kind: "circle", x: 100, y: 100, radius: 5 });
  });

  it("radius 0 returns only provinces exactly at center", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as { provinces: Array<{ i: number }>; count: number };
    // i=1 pole (100,100) and i=8 center-fallback (100,100)
    expect(new Set(result.provinces.map((p) => p.i))).toEqual(new Set([1, 8]));
    expect(result.count).toBe(2);
  });

  it("limit truncates provinces but count reports full total", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    }) as { provinces: Array<{ i: number }>; count: number };
    expect(result.provinces.length).toBe(2);
    expect(result.count).toBe(5);
  });

  it("skips i=0, removed, and provinces with no pole and no center-cell coords", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      limit: 100,
    }) as { provinces: Array<{ i: number }>; count: number };
    const ids = new Set(result.provinces.map((p) => p.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(9)).toBe(false); // no pos
    // Active valid provinces: 1,2,3,4,5,6,8,10 = 8 total
    expect(result.count).toBe(8);
  });

  it("returns empty list and count 0 when no province matches", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 9999,
      y: 9999,
      radius: 1,
      limit: 100,
    }) as { provinces: unknown[]; count: number };
    expect(result.provinces).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("uses pole when present, else falls back to cells.p[center]", () => {
    const pack = makePack();
    // i=2 has pole; ensure x/y match pole not center lookup.
    const result = findProvincesInAreaInPack(asPack(pack), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as {
      provinces: Array<{ i: number; x: number; y: number }>;
    };
    const byId = new Map(result.provinces.map((p) => [p.i, p]));
    expect(byId.get(2)).toEqual(expect.objectContaining({ x: 103, y: 104 }));
    // i=8 has no pole but center=1 → cells.p[1]=(100,100)
    expect(byId.get(8)).toEqual(expect.objectContaining({ x: 100, y: 100 }));
  });

  it("returns 'not-ready' when pack or pack.provinces is missing", () => {
    expect(
      findProvincesInAreaInPack(undefined, {
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findProvincesInAreaInPack(
        {} as unknown as Parameters<typeof findProvincesInAreaInPack>[0],
        { kind: "rect", x1: 0, y1: 0, x2: 1, y2: 1, limit: 100 },
      ),
    ).toBe("not-ready");
  });

  it("circle-cell returns 'out-of-bounds' when cell >= cells.i.length", () => {
    expect(
      findProvincesInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 999,
        radius: 10,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("circle-cell returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findProvincesInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 7,
        radius: 10,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });

  it("echoes fullName and color when present, null otherwise", () => {
    const result = findProvincesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as {
      provinces: Array<{
        i: number;
        fullName: string | null;
        color: string | null;
      }>;
    };
    const p1 = result.provinces.find((p) => p.i === 1);
    const p8 = result.provinces.find((p) => p.i === 8);
    expect(p1?.fullName).toBe("Core Province");
    expect(p1?.color).toBe("#f00");
    expect(p8?.fullName).toBeNull();
    expect(p8?.color).toBeNull();
  });
});

describe("find_provinces_in_area — tool surface", () => {
  function realRuntime(): FindProvincesInAreaRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findProvincesInAreaInPack(pack, q),
    };
  }

  it("rejects when no area supplied", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/either a rectangle/i);
  });

  it("rejects when rectangle and circle params mixed", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
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
    const tool = createFindProvincesInAreaTool(realRuntime());
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
    const tool = createFindProvincesInAreaTool(realRuntime());
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
    const tool = createFindProvincesInAreaTool(realRuntime());
    const r = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not both/i);
  });

  it("rejects circle with neither center form", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    const r = await tool.execute({ radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/center/i);
  });

  it("rejects circle missing y (or x) when the other is supplied", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
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
    const tool = createFindProvincesInAreaTool(realRuntime());
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
    const tool = createFindProvincesInAreaTool(realRuntime());
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
    const tool = createFindProvincesInAreaTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    const ids = new Set(body.provinces.map((p: { i: number }) => p.i));
    expect(ids).toEqual(new Set([1, 8]));
    expect(body.count).toBe(2);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 0,
    });
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 0 },
      {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        limit: MAX_FIND_PROVINCES_IN_AREA_LIMIT + 1,
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
    const tool = createFindProvincesInAreaTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindProvincesInAreaTool(
      runtimeReturning("out-of-bounds"),
    );
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindProvincesInAreaTool(
      runtimeReturning("no-cell-point"),
    );
    const result = await tool.execute({ cell: 3, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/3/);
  });

  it("returns ok with rectangle results and echoes area", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.provinces.map((p: { i: number }) => p.i))).toEqual(
      new Set([1, 2, 3, 4, 8]),
    );
    expect(body.count).toBe(5);
    expect(body.area).toEqual({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    for (const p of body.provinces) expect(p.distance).toBeNull();
  });

  it("returns ok with circle results (distance populated)", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.provinces.map((p: { i: number }) => p.i))).toEqual(
      new Set([1, 2, 3, 4, 8]),
    );
    expect(body.count).toBe(5);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const p of body.provinces) expect(typeof p.distance).toBe("number");
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindProvincesInAreaTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.provinces.length).toBe(2);
    expect(body.count).toBe(5);
  });

  it("is exported as findProvincesInAreaTool with the expected schema", () => {
    expect(findProvincesInAreaTool.name).toBe("find_provinces_in_area");
    expect(findProvincesInAreaTool.input_schema.type).toBe("object");
    expect(findProvincesInAreaTool.input_schema.required).toBeUndefined();
    expect(findProvincesInAreaTool.input_schema.properties.x1).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.y1).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.x2).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.y2).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.x).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.y).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.cell).toBeDefined();
    expect(
      findProvincesInAreaTool.input_schema.properties.radius,
    ).toBeDefined();
    expect(findProvincesInAreaTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_PROVINCES_IN_AREA_LIMIT).toBe(10000);
    expect(MAX_FIND_PROVINCES_IN_AREA_LIMIT).toBe(100000);
  });
});

// ----- defaultFindProvincesInAreaRuntime integration -----

describe("defaultFindProvincesInAreaRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a rectangle query", () => {
    const result = defaultFindProvincesInAreaRuntime.find({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { provinces: Array<{ i: number }>; count: number };
    expect(new Set(result.provinces.map((p) => p.i))).toEqual(
      new Set([1, 2, 3, 4, 8]),
    );
    expect(result.count).toBe(5);
  });

  it("reads real pack via default runtime for a circle-coords query", () => {
    const result = defaultFindProvincesInAreaRuntime.find({
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      provinces: Array<{ i: number; distance: number | null }>;
      area: unknown;
    };
    expect(new Set(result.provinces.map((p) => p.i))).toEqual(
      new Set([1, 2, 3, 4, 8]),
    );
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
  });

  it("reads real pack via default runtime for a circle-cell query", () => {
    const result = defaultFindProvincesInAreaRuntime.find({
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      provinces: Array<{ i: number }>;
      area: { x: number; y: number };
    };
    expect(new Set(result.provinces.map((p) => p.i))).toEqual(
      new Set([1, 2, 8]),
    );
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
      defaultFindProvincesInAreaRuntime.find({
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findProvincesInAreaTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
