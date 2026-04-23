import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindNearestRiverTool,
  defaultFindNearestRiverRuntime,
  type FindNearestRiverResult,
  type FindNearestRiverRuntime,
  findNearestRiverInPack,
  findNearestRiverTool,
} from "./find-nearest-river";

interface FakeRiver {
  i: number;
  name?: string;
  source?: number;
  mouth?: number;
  removed?: boolean;
}

interface FakePack {
  rivers: FakeRiver[];
  cells?: {
    i?: number[];
    p?: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findNearestRiverInPack>[0];
}

// cells.p layout for the main fixture:
//   cell 0 → (0, 0)     (placeholder / spare)
//   cell 1 → (100, 100) (source of Stormwater — river i=1)
//   cell 2 → (500, 500) (mouth of Stormwater)
//   cell 3 → (600, 600) (source of Ashflow — river i=2)
//   cell 4 → (800, 800) (mouth of Ashflow)
//   cell 5 → (250, 250) (source of Rookrun — river i=4)
//   cell 6 → (260, 260) (mouth of Rookrun; removed)
//   cell 7 → (10, 20)   (mouth of Dryriver — river i=5 — no source)
function makePack(): FakePack {
  return {
    rivers: [
      // placeholder — must be skipped even if source / mouth exist.
      { i: 0, name: "placeholder", source: 1, mouth: 2 },
      { i: 1, name: "Stormwater", source: 1, mouth: 2 },
      { i: 2, name: "Ashflow", source: 3, mouth: 4 },
      // removed river very close to (251, 251).
      {
        i: 4,
        name: "Rookrun",
        source: 5,
        mouth: 6,
        removed: true,
      },
      // river with only a mouth (no source).
      { i: 5, name: "Dryriver", mouth: 7 },
    ],
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      p: [
        [0, 0],
        [100, 100],
        [500, 500],
        [600, 600],
        [800, 800],
        [250, 250],
        [260, 260],
        [10, 20],
      ],
    },
  };
}

function runtimeReturning(
  result: FindNearestRiverResult,
): FindNearestRiverRuntime {
  return { findNearest: () => result };
}

describe("find_nearest_river — pure / seam", () => {
  it("coordinate query returns the closest active river via source", () => {
    // (105, 104) is near Stormwater's source at (100, 100); dist ~6.4.
    // Its mouth is at (500, 500) — far. Nearest river should be i=1.
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "coords",
      x: 105,
      y: 104,
    });
    expect(result).toMatchObject({ i: 1, name: "Stormwater" });
  });

  it("coordinate query returns the closest active river via mouth", () => {
    // (499, 501) is right at Stormwater's mouth (500, 500). Source is
    // far (100, 100). Nearest endpoint wins: expect i=1, (500, 500).
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "coords",
      x: 499,
      y: 501,
    }) as { i: number; x: number; y: number };
    expect(result.i).toBe(1);
    expect(result.x).toBe(500);
    expect(result.y).toBe(500);
  });

  it("cell query resolves pack.cells.p[cell] then returns closest river", () => {
    // cells.p[3] = (600, 600) — exactly at Ashflow's source (cell 3).
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "cell",
      cell: 3,
    });
    expect(result).toMatchObject({ i: 2, name: "Ashflow" });
  });

  it("skips the i=0 placeholder", () => {
    // Query at Stormwater's exact source (100, 100). Placeholder has the
    // same source/mouth but i=0 so must be skipped; Stormwater (i=1)
    // wins.
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "coords",
      x: 100,
      y: 100,
    });
    expect(result).toMatchObject({ i: 1 });
  });

  it("skips removed rivers", () => {
    // (251, 251) is 1.4 away from Rookrun source (250,250) — but Rookrun
    // is removed. Nearest active endpoint is Stormwater source
    // (100, 100) at dist ~213.
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "coords",
      x: 251,
      y: 251,
    });
    expect(result).toMatchObject({ i: 1 });
  });

  it("returns endpoint coords matching the nearer of source/mouth", () => {
    // Query close to Dryriver's mouth (10, 20); Dryriver has no source.
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "coords",
      x: 11,
      y: 21,
    }) as { i: number; x: number; y: number };
    expect(result.i).toBe(5);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it("breaks ties deterministically by iteration order", () => {
    // Two rivers equidistant from (0, 0). First in array wins.
    const pack: FakePack = {
      rivers: [
        { i: 1, name: "A", source: 1, mouth: 2 }, // source (3,4) dist 5
        { i: 2, name: "B", source: 3, mouth: 4 }, // source (4,3) dist 5
      ],
      cells: {
        i: [0, 1, 2, 3, 4],
        p: [
          [0, 0],
          [3, 4],
          [100, 100],
          [4, 3],
          [200, 200],
        ],
      },
    };
    const result = findNearestRiverInPack(asPack(pack), {
      kind: "coords",
      x: 0,
      y: 0,
    });
    expect(result).toMatchObject({ i: 1, name: "A" });
  });

  it("distance is Euclidean from the query point", () => {
    // (103, 104) to Stormwater source (100, 100): dx=3, dy=4 → dist=5.
    const result = findNearestRiverInPack(asPack(makePack()), {
      kind: "coords",
      x: 103,
      y: 104,
    }) as { distance: number };
    expect(result.distance).toBeCloseTo(5, 10);
  });

  it("returns { i: null, ... } when no active rivers exist", () => {
    const pack: FakePack = {
      rivers: [{ i: 0, name: "placeholder" }],
    };
    const result = findNearestRiverInPack(asPack(pack), {
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

  it("returns { i: null, ... } when no river has usable endpoints", () => {
    // Rivers exist but their source / mouth cells are absent from cells.p.
    const pack: FakePack = {
      rivers: [
        { i: 1, name: "Ghost", source: 99, mouth: 98 },
        { i: 2, name: "Nothing" }, // no source or mouth
      ],
      cells: {
        i: [0],
        p: [[0, 0]],
      },
    };
    const result = findNearestRiverInPack(asPack(pack), {
      kind: "coords",
      x: 0,
      y: 0,
    });
    expect(result).toEqual({
      i: null,
      name: null,
      x: null,
      y: null,
      distance: null,
    });
  });

  it("returns 'not-ready' when pack.rivers is missing", () => {
    expect(
      findNearestRiverInPack(undefined, { kind: "coords", x: 1, y: 2 }),
    ).toBe("not-ready");
    expect(
      findNearestRiverInPack(
        {} as unknown as Parameters<typeof findNearestRiverInPack>[0],
        { kind: "coords", x: 1, y: 2 },
      ),
    ).toBe("not-ready");
  });

  it("returns 'out-of-bounds' when cell is past cells.i.length", () => {
    expect(
      findNearestRiverInPack(asPack(makePack()), { kind: "cell", cell: 999 }),
    ).toBe("out-of-bounds");
  });

  it("returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    const pack = makePack();
    (pack.cells as { p: Array<[number, number] | undefined> }).p[1] = undefined;
    expect(
      findNearestRiverInPack(asPack(pack), { kind: "cell", cell: 1 }),
    ).toBe("no-cell-point");
  });
});

describe("find_nearest_river — tool surface", () => {
  function realRuntime(): FindNearestRiverRuntime {
    const pack = asPack(makePack());
    return {
      findNearest: (q) => findNearestRiverInPack(pack, q),
    };
  }

  it("rejects when neither x/y nor cell provided", async () => {
    const tool = createFindNearestRiverTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /either \(x, y\) coordinates or a cell id/i,
    );
  });

  it("rejects when both x/y and cell are provided", async () => {
    const tool = createFindNearestRiverTool(realRuntime());
    const result = await tool.execute({ x: 1, y: 2, cell: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not both/i);
  });

  it("rejects non-finite x or y", async () => {
    const tool = createFindNearestRiverTool(realRuntime());
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
    const tool = createFindNearestRiverTool(realRuntime());
    const r1 = await tool.execute({ x: 1 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-integer or negative cell", async () => {
    const tool = createFindNearestRiverTool(realRuntime());
    for (const bad of [{ cell: "1" }, { cell: 1.5 }, { cell: -1 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindNearestRiverTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindNearestRiverTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of bounds/i);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindNearestRiverTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coordinates/i);
  });

  it("returns ok=true with i=null when map has no matching rivers", async () => {
    const tool = createFindNearestRiverTool(
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

  it("returns ok=true with the found river on a happy path", async () => {
    const tool = createFindNearestRiverTool(realRuntime());
    const result = await tool.execute({ x: 101, y: 100 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.name).toBe("Stormwater");
    expect(body.x).toBe(100);
    expect(body.y).toBe(100);
    expect(typeof body.distance).toBe("number");
  });

  it("is exported as findNearestRiverTool with the expected schema", () => {
    expect(findNearestRiverTool.name).toBe("find_nearest_river");
    expect(findNearestRiverTool.input_schema.type).toBe("object");
    // No required[] — the oneOf-style validation is done at runtime.
    expect(findNearestRiverTool.input_schema.required).toBeUndefined();
    expect(findNearestRiverTool.input_schema.properties.x).toBeDefined();
    expect(findNearestRiverTool.input_schema.properties.y).toBeDefined();
    expect(findNearestRiverTool.input_schema.properties.cell).toBeDefined();
  });
});

// ----- defaultFindNearestRiverRuntime integration -----

describe("defaultFindNearestRiverRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a coordinate query", () => {
    const result = defaultFindNearestRiverRuntime.findNearest({
      kind: "coords",
      x: 601,
      y: 599,
    });
    // Ashflow source is at (600, 600) — very close.
    expect(result).toMatchObject({ i: 2, name: "Ashflow" });
  });

  it("reads real pack via default runtime for a cell query", () => {
    const result = defaultFindNearestRiverRuntime.findNearest({
      kind: "cell",
      cell: 2,
    });
    // cells.p[2] = (500, 500) — exactly at Stormwater's mouth.
    expect(result).toMatchObject({ i: 1, name: "Stormwater" });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindNearestRiverRuntime.findNearest({
        kind: "coords",
        x: 0,
        y: 0,
      }),
    ).toBe("not-ready");
    const result = await findNearestRiverTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
