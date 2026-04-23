import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindNearestBurgTool,
  defaultFindNearestBurgRuntime,
  type FindNearestBurgResult,
  type FindNearestBurgRuntime,
  findNearestBurgInPack,
  findNearestBurgTool,
} from "./find-nearest-burg";

interface FakeBurg {
  i: number;
  name?: string;
  x?: number;
  y?: number;
  removed?: boolean;
}

interface FakePack {
  burgs: FakeBurg[];
  cells?: {
    i?: number[];
    p?: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findNearestBurgInPack>[0];
}

function makePack(): FakePack {
  return {
    burgs: [
      // placeholder — has coords but i=0, must be skipped
      { i: 0, name: "placeholder", x: 50, y: 50 },
      { i: 1, name: "Stormport", x: 100, y: 100 },
      { i: 2, name: "Ashgard", x: 500, y: 500 },
      { i: 3, name: "Gonehaven", x: 120, y: 120, removed: true },
      { i: 4, name: "Rookmark", x: 300, y: 300 },
    ],
    cells: {
      i: [0, 1, 2],
      p: [
        [50, 50],
        [110, 110],
        [499, 499],
      ],
    },
  };
}

function makeTiePack(): FakePack {
  // Two burgs equidistant from (0,0) to exercise deterministic tie-break.
  return {
    burgs: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "A", x: 3, y: 4 }, // dist 5
      { i: 2, name: "B", x: 4, y: 3 }, // dist 5
    ],
  };
}

function runtimeReturning(
  result: FindNearestBurgResult,
): FindNearestBurgRuntime {
  return { findNearest: () => result };
}

describe("find_nearest_burg — pure / seam", () => {
  it("coordinate query returns the closest active burg", () => {
    const result = findNearestBurgInPack(asPack(makePack()), {
      kind: "coords",
      x: 110,
      y: 110,
    });
    expect(result).toMatchObject({ i: 1, name: "Stormport" });
  });

  it("cell query resolves pack.cells.p[cell] then returns closest burg", () => {
    const result = findNearestBurgInPack(asPack(makePack()), {
      kind: "cell",
      cell: 2,
    });
    expect(result).toMatchObject({ i: 2, name: "Ashgard" });
  });

  it("skips the index-0 placeholder even when it has coordinates", () => {
    // Query exactly at placeholder (50,50) — placeholder has dist 0 but i=0
    // so it must be skipped. Nearest active is Stormport at (100,100).
    const result = findNearestBurgInPack(asPack(makePack()), {
      kind: "coords",
      x: 50,
      y: 50,
    });
    expect(result).toMatchObject({ i: 1 });
  });

  it("skips removed burgs", () => {
    // Gonehaven at (120,120) is closer to (119,119) than Stormport (100,100),
    // but it's removed. Expect Stormport.
    const result = findNearestBurgInPack(asPack(makePack()), {
      kind: "coords",
      x: 119,
      y: 119,
    });
    expect(result).toMatchObject({ i: 1 });
  });

  it("breaks ties deterministically by iteration order", () => {
    // Two burgs equidistant from origin — iteration order puts i=1 first.
    const result = findNearestBurgInPack(asPack(makeTiePack()), {
      kind: "coords",
      x: 0,
      y: 0,
    });
    expect(result).toMatchObject({ i: 1, name: "A" });
  });

  it("distance is the Euclidean distance from the query point", () => {
    const result = findNearestBurgInPack(asPack(makePack()), {
      kind: "coords",
      x: 103,
      y: 104,
    }) as { distance: number };
    // Closest to (103, 104) is Stormport (100, 100); dx=3, dy=4, dist=5.
    expect(result.distance).toBeCloseTo(5, 10);
  });

  it("returns { i: null, ... } when no active burgs exist", () => {
    const pack: FakePack = { burgs: [{ i: 0, name: "placeholder" }] };
    const result = findNearestBurgInPack(asPack(pack), {
      kind: "coords",
      x: 10,
      y: 10,
    });
    expect(result).toEqual({
      i: null,
      name: null,
      x: null,
      y: null,
      distance: null,
    });
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    expect(
      findNearestBurgInPack(undefined, { kind: "coords", x: 1, y: 2 }),
    ).toBe("not-ready");
    expect(
      findNearestBurgInPack(
        {} as unknown as Parameters<typeof findNearestBurgInPack>[0],
        { kind: "coords", x: 1, y: 2 },
      ),
    ).toBe("not-ready");
  });

  it("returns 'out-of-bounds' when cell is past cells.i.length", () => {
    expect(
      findNearestBurgInPack(asPack(makePack()), { kind: "cell", cell: 999 }),
    ).toBe("out-of-bounds");
  });

  it("returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    const pack = makePack();
    (pack.cells as { p: Array<[number, number] | undefined> }).p[1] = undefined;
    expect(findNearestBurgInPack(asPack(pack), { kind: "cell", cell: 1 })).toBe(
      "no-cell-point",
    );
  });
});

describe("find_nearest_burg — tool surface", () => {
  function realRuntime(): FindNearestBurgRuntime {
    const pack = asPack(makePack());
    return {
      findNearest: (q) => findNearestBurgInPack(pack, q),
    };
  }

  it("rejects when neither x/y nor cell provided", async () => {
    const tool = createFindNearestBurgTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /either \(x, y\) coordinates or a cell id/i,
    );
  });

  it("rejects when both x/y and cell are provided", async () => {
    const tool = createFindNearestBurgTool(realRuntime());
    const result = await tool.execute({ x: 1, y: 2, cell: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not both/i);
  });

  it("rejects non-finite x or y", async () => {
    const tool = createFindNearestBurgTool(realRuntime());
    for (const bad of [
      { x: "1", y: 2 },
      { x: 1, y: "2" },
      { x: Number.NaN, y: 2 },
      { x: 1, y: Number.POSITIVE_INFINITY },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite/i);
    }
  });

  it("rejects missing y when x is provided (and vice versa)", async () => {
    const tool = createFindNearestBurgTool(realRuntime());
    const r1 = await tool.execute({ x: 1 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-integer or negative cell", async () => {
    const tool = createFindNearestBurgTool(realRuntime());
    for (const bad of [{ cell: "1" }, { cell: 1.5 }, { cell: -1 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindNearestBurgTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindNearestBurgTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of bounds/i);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindNearestBurgTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coordinates/i);
  });

  it("returns ok=true with i=null when map has no active burgs", async () => {
    const tool = createFindNearestBurgTool(
      runtimeReturning({
        i: null,
        name: null,
        x: null,
        y: null,
        distance: null,
      }),
    );
    const result = await tool.execute({ x: 5, y: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      i: null,
      name: null,
      x: null,
      y: null,
      distance: null,
    });
  });

  it("returns ok=true with the found burg on a happy path", async () => {
    const tool = createFindNearestBurgTool(realRuntime());
    const result = await tool.execute({ x: 102, y: 100 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.name).toBe("Stormport");
    expect(body.x).toBe(100);
    expect(body.y).toBe(100);
    expect(typeof body.distance).toBe("number");
  });

  it("is exported as findNearestBurgTool with the expected schema", () => {
    expect(findNearestBurgTool.name).toBe("find_nearest_burg");
    expect(findNearestBurgTool.input_schema.type).toBe("object");
    // No required[] — the oneOf-style validation is done at runtime.
    expect(findNearestBurgTool.input_schema.required).toBeUndefined();
    expect(findNearestBurgTool.input_schema.properties.x).toBeDefined();
    expect(findNearestBurgTool.input_schema.properties.y).toBeDefined();
    expect(findNearestBurgTool.input_schema.properties.cell).toBeDefined();
  });
});

// ----- defaultFindNearestBurgRuntime integration -----

describe("defaultFindNearestBurgRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a coordinate query", () => {
    const result = defaultFindNearestBurgRuntime.findNearest({
      kind: "coords",
      x: 498,
      y: 499,
    });
    expect(result).toMatchObject({ i: 2, name: "Ashgard" });
  });

  it("reads real pack via default runtime for a cell query", () => {
    const result = defaultFindNearestBurgRuntime.findNearest({
      kind: "cell",
      cell: 1,
    });
    // cells.p[1] = (110, 110); closest active burg is Stormport (100,100).
    expect(result).toMatchObject({ i: 1, name: "Stormport" });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindNearestBurgRuntime.findNearest({
        kind: "coords",
        x: 0,
        y: 0,
      }),
    ).toBe("not-ready");
    const result = await findNearestBurgTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
