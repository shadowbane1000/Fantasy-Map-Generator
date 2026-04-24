import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCulturesInAreaTool,
  DEFAULT_FIND_CULTURES_IN_AREA_LIMIT,
  defaultFindCulturesInAreaRuntime,
  type FindCulturesInAreaResult,
  type FindCulturesInAreaRuntime,
  findCulturesInAreaInPack,
  findCulturesInAreaTool,
  MAX_FIND_CULTURES_IN_AREA_LIMIT,
} from "./find-cultures-in-area";

interface FakePack {
  cultures: Array<{
    i: number;
    name?: string;
    color?: string;
    type?: string;
    center?: number;
    removed?: boolean;
  }>;
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findCulturesInAreaInPack>[0];
}

function makePack(): FakePack {
  // Cultures arranged around (100, 100) via pack.cells.p[center]:
  //   i=0: Wildlands, center=0 → cells.p[0]=(0,0). Allowed.
  //   i=1: center=1 → (100, 100), type "Generic"
  //   i=2: center=2 → (103, 104), type "River"
  //   i=3: center=3 → (110, 100)
  //   i=4: center=4 → (100, 110)
  //   i=5: center=5 → (115, 115)
  //   i=6: center=6 → (200, 200) — far
  //   i=7: removed=true, center=1 → would match
  //   i=8: no center → skipped
  //   i=9: center=7 → cells.p[7]=undefined → skipped
  //   i=10: center=9 → (50, 50), no color/type
  return {
    cultures: [
      { i: 0, name: "Wildlands", center: 0, type: "" },
      {
        i: 1,
        name: "Core",
        color: "#f00",
        type: "Generic",
        center: 1,
      },
      { i: 2, name: "North", color: "#0f0", type: "River", center: 2 },
      { i: 3, name: "East", color: "#00f", type: "Naval", center: 3 },
      { i: 4, name: "South", color: "#ff0", type: "Highland", center: 4 },
      { i: 5, name: "Edge", color: "#0ff", type: "Hunting", center: 5 },
      { i: 6, name: "Far", color: "#f0f", type: "Nomadic", center: 6 },
      {
        i: 7,
        name: "Gone",
        color: "#999",
        type: "Generic",
        center: 1,
        removed: true,
      },
      { i: 8, name: "NoCenter", color: "#222", type: "Generic" },
      { i: 9, name: "MissingPoint", center: 7 },
      { i: 10, name: "Corner", center: 9 },
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
  result: FindCulturesInAreaResult,
): FindCulturesInAreaRuntime {
  return { find: () => result };
}

describe("find_cultures_in_area — pure / seam", () => {
  it("rectangle returns every active culture inside the box (inclusive edges)", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as {
      cultures: Array<{ i: number }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.cultures.map((c) => c.i));
    // centers at (100,100), (103,104), (110,100), (100,110) for i=1,2,3,4
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
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 110,
      y1: 110,
      x2: 100,
      y2: 100,
      limit: 100,
    }) as {
      cultures: Array<{ i: number }>;
      area: { x1: number; x2: number; y1: number; y2: number };
    };
    const ids = new Set(result.cultures.map((c) => c.i));
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.area.x1).toBe(100);
    expect(result.area.x2).toBe(110);
    expect(result.area.y1).toBe(100);
    expect(result.area.y2).toBe(110);
  });

  it("rectangle culture distance is null", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1,
      y1: -1,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as { cultures: Array<{ distance: number | null }> };
    for (const c of result.cultures) expect(c.distance).toBeNull();
  });

  it("circle-coords returns every culture inside radius with distance", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      cultures: Array<{ i: number; distance: number | null }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.cultures.map((c) => c.i));
    // radius 10 from (100,100): 1 (0), 2 (5), 3 (10 exact), 4 (10 exact)
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const c of result.cultures) {
      expect(typeof c.distance).toBe("number");
      expect(c.distance).toBeLessThanOrEqual(10);
    }
  });

  it("circle-cell resolves center via pack.cells.p[cell]", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      cultures: Array<{ i: number }>;
      count: number;
      area: { x: number; y: number; radius: number };
    };
    // cells.p[1] = (100,100). Radius 5 hits center-1 (0), center-2 (5).
    const ids = new Set(result.cultures.map((c) => c.i));
    expect(ids).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({ kind: "circle", x: 100, y: 100, radius: 5 });
  });

  it("radius 0 returns only cultures exactly at center", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as { cultures: Array<{ i: number }>; count: number };
    // i=1 center=1 → (100,100)
    expect(new Set(result.cultures.map((c) => c.i))).toEqual(new Set([1]));
    expect(result.count).toBe(1);
  });

  it("limit truncates cultures but count reports full total", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    }) as { cultures: Array<{ i: number }>; count: number };
    expect(result.cultures.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("allows culture 0 (Wildlands) when its center resolves inside the area", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1,
      y1: -1,
      x2: 1,
      y2: 1,
      limit: 100,
    }) as { cultures: Array<{ i: number }>; count: number };
    const ids = new Set(result.cultures.map((c) => c.i));
    // cells.p[0] = (0,0), so culture 0 is included in this tiny box.
    expect(ids.has(0)).toBe(true);
  });

  it("skips removed, missing-center, and cultures whose center points at a cell without coords", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      limit: 100,
    }) as { cultures: Array<{ i: number }>; count: number };
    const ids = new Set(result.cultures.map((c) => c.i));
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // no center
    expect(ids.has(9)).toBe(false); // center points at cell 7 (undefined)
    // Active cultures with resolvable center: 0, 1, 2, 3, 4, 5, 6, 10 = 8
    expect(result.count).toBe(8);
  });

  it("returns empty list and count 0 when no culture matches", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 9999,
      y: 9999,
      radius: 1,
      limit: 100,
    }) as { cultures: unknown[]; count: number };
    expect(result.cultures).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("echoes color and type when present, null otherwise", () => {
    const result = findCulturesInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 40,
      y1: 40,
      x2: 120,
      y2: 120,
      limit: 100,
    }) as {
      cultures: Array<{
        i: number;
        color: string | null;
        type: string | null;
      }>;
    };
    const byId = new Map(result.cultures.map((c) => [c.i, c]));
    expect(byId.get(1)?.color).toBe("#f00");
    expect(byId.get(1)?.type).toBe("Generic");
    // i=10 has no color or type
    expect(byId.get(10)?.color).toBeNull();
    expect(byId.get(10)?.type).toBeNull();
  });

  it("returns 'not-ready' when pack or pack.cultures is missing", () => {
    expect(
      findCulturesInAreaInPack(undefined, {
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findCulturesInAreaInPack(
        {} as unknown as Parameters<typeof findCulturesInAreaInPack>[0],
        { kind: "rect", x1: 0, y1: 0, x2: 1, y2: 1, limit: 100 },
      ),
    ).toBe("not-ready");
  });

  it("circle-cell returns 'out-of-bounds' when cell >= cells.i.length", () => {
    expect(
      findCulturesInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 999,
        radius: 10,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("circle-cell returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findCulturesInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 7,
        radius: 10,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_cultures_in_area — tool surface", () => {
  function realRuntime(): FindCulturesInAreaRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findCulturesInAreaInPack(pack, q),
    };
  }

  it("rejects when no area supplied", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/either a rectangle/i);
  });

  it("rejects when rectangle and circle params mixed", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
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
    const tool = createFindCulturesInAreaTool(realRuntime());
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
    const tool = createFindCulturesInAreaTool(realRuntime());
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
    const tool = createFindCulturesInAreaTool(realRuntime());
    const r = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not both/i);
  });

  it("rejects circle with neither center form", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    const r = await tool.execute({ radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/center/i);
  });

  it("rejects circle missing y (or x) when the other is supplied", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
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
    const tool = createFindCulturesInAreaTool(realRuntime());
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
    const tool = createFindCulturesInAreaTool(realRuntime());
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
    const tool = createFindCulturesInAreaTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    const ids = new Set(body.cultures.map((c: { i: number }) => c.i));
    expect(ids).toEqual(new Set([1]));
    expect(body.count).toBe(1);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 0,
    });
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 0 },
      {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        limit: MAX_FIND_CULTURES_IN_AREA_LIMIT + 1,
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
    const tool = createFindCulturesInAreaTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindCulturesInAreaTool(
      runtimeReturning("out-of-bounds"),
    );
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindCulturesInAreaTool(
      runtimeReturning("no-cell-point"),
    );
    const result = await tool.execute({ cell: 3, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/3/);
  });

  it("returns ok with rectangle results and echoes area", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.cultures.map((c: { i: number }) => c.i))).toEqual(
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
    for (const c of body.cultures) expect(c.distance).toBeNull();
  });

  it("returns ok with circle results (distance populated)", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.cultures.map((c: { i: number }) => c.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const c of body.cultures) expect(typeof c.distance).toBe("number");
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindCulturesInAreaTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cultures.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("is exported as findCulturesInAreaTool with the expected schema", () => {
    expect(findCulturesInAreaTool.name).toBe("find_cultures_in_area");
    expect(findCulturesInAreaTool.input_schema.type).toBe("object");
    expect(findCulturesInAreaTool.input_schema.required).toBeUndefined();
    expect(findCulturesInAreaTool.input_schema.properties.x1).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.y1).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.x2).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.y2).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.x).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.y).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.cell).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.radius).toBeDefined();
    expect(findCulturesInAreaTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_CULTURES_IN_AREA_LIMIT).toBe(10000);
    expect(MAX_FIND_CULTURES_IN_AREA_LIMIT).toBe(100000);
  });
});

// ----- defaultFindCulturesInAreaRuntime integration -----

describe("defaultFindCulturesInAreaRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a rectangle query", () => {
    const result = defaultFindCulturesInAreaRuntime.find({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { cultures: Array<{ i: number }>; count: number };
    expect(new Set(result.cultures.map((c) => c.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.count).toBe(4);
  });

  it("reads real pack via default runtime for a circle-coords query", () => {
    const result = defaultFindCulturesInAreaRuntime.find({
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      cultures: Array<{ i: number; distance: number | null }>;
      area: unknown;
    };
    expect(new Set(result.cultures.map((c) => c.i))).toEqual(
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
    const result = defaultFindCulturesInAreaRuntime.find({
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      cultures: Array<{ i: number }>;
      area: { x: number; y: number };
    };
    expect(new Set(result.cultures.map((c) => c.i))).toEqual(new Set([1, 2]));
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
      defaultFindCulturesInAreaRuntime.find({
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findCulturesInAreaTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
