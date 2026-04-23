import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsByFeatureTool,
  DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
  defaultFindBurgsByFeatureRuntime,
  type FindBurgsByFeatureResult,
  type FindBurgsByFeatureRuntime,
  findBurgsByFeatureInPack,
  findBurgsByFeatureTool,
  MAX_FIND_BURGS_BY_FEATURE_LIMIT,
  type ResolveFeatureResult,
  resolveFeatureRefInPack,
} from "./find-burgs-by-feature";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    cell?: number;
    capital?: number;
    population?: number;
    removed?: boolean;
  }>;
  features: Array<
    | {
        i?: number;
        type?: string;
        name?: string;
      }
    | 0
    | undefined
    | null
  >;
  cells: {
    f: Array<number | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsByFeatureInPack>[0];
}

function makePack(): FakePack {
  // Features:
  //   [0]: 0 (sentinel placeholder)
  //   1: island "Isle"
  //   2: continent "Main"
  //   3: lake "Mirror"
  //   4: ocean (no name — exercises null)
  //   5: 0 (empty slot)
  //
  // cells.f (indices 0..20) maps cell -> feature id:
  //   cell 10: feature 1
  //   cell 11: feature 1
  //   cell 12: feature 2
  //   cell 13: feature 1
  //   cell 14: feature 2
  //   cell 15: feature 4
  //   cell 16: feature 1 (used by removed burg — must be skipped)
  //   cell 17: feature 4
  //
  // Burgs:
  //   0: placeholder
  //   1: capital on cell 10 → feature 1
  //   2: town on cell 11 → feature 1
  //   3: town on cell 12 → feature 2
  //   4: town on cell 13 → feature 1
  //   5: capital town on cell 14 → feature 2
  //   6: town on cell 15 → feature 4
  //   7: removed on cell 16 (feature 1) — skipped
  //   8: no cell — skipped
  //   9: cell 99 (out-of-bounds in cells.f) — skipped
  //   10: town on cell 17 → feature 4 (unnamed ocean)
  const cellFeature: Array<number | undefined> = [];
  cellFeature[10] = 1;
  cellFeature[11] = 1;
  cellFeature[12] = 2;
  cellFeature[13] = 1;
  cellFeature[14] = 2;
  cellFeature[15] = 4;
  cellFeature[16] = 1;
  cellFeature[17] = 4;

  return {
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Astral",
        x: 100,
        y: 200,
        cell: 10,
        capital: 1,
        population: 12.5,
      },
      {
        i: 2,
        name: "Birchwell",
        x: 110,
        y: 210,
        cell: 11,
        capital: 0,
        population: 4.3,
      },
      {
        i: 3,
        name: "Coldreach",
        x: 300,
        y: 400,
        cell: 12,
        capital: 0,
        population: 2.1,
      },
      {
        i: 4,
        name: "Dusktown",
        x: 115,
        y: 220,
        cell: 13,
        capital: 0,
        population: 1.2,
      },
      {
        i: 5,
        name: "Emberkeep",
        x: 320,
        y: 410,
        cell: 14,
        capital: 1,
        population: 8.0,
      },
      {
        i: 6,
        name: "Freehold",
        x: 500,
        y: 500,
        cell: 15,
        capital: 0,
        population: 0.5,
      },
      {
        i: 7,
        name: "Gone",
        x: 0,
        y: 0,
        cell: 16,
        capital: 0,
        population: 1,
        removed: true,
      },
      { i: 8, name: "Orphan", x: 0, y: 0 },
      {
        i: 9,
        name: "Wandering",
        x: 0,
        y: 0,
        cell: 99,
        capital: 0,
        population: 1,
      },
      {
        i: 10,
        name: "Seashore",
        x: 510,
        y: 510,
        cell: 17,
        capital: 0,
        population: 0.75,
      },
    ],
    features: [
      0,
      { i: 1, type: "island", name: "Isle" },
      { i: 2, type: "continent", name: "Main" },
      { i: 3, type: "lake", name: "Mirror" },
      { i: 4, type: "ocean" },
      0,
    ],
    cells: { f: cellFeature },
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveFeatureResult;
  find?: FindBurgsByFeatureResult;
}): FindBurgsByFeatureRuntime {
  return {
    resolveFeature: () =>
      opts.resolve ?? { i: 1, type: "island", name: "Isle" },
    find: () => opts.find ?? { burgs: [], count: 0 },
  };
}

function realRuntime(): FindBurgsByFeatureRuntime {
  const pack = asPack(makePack());
  return {
    resolveFeature: (id) => resolveFeatureRefInPack(pack, id),
    find: (featureI, limit) => findBurgsByFeatureInPack(pack, featureI, limit),
  };
}

describe("find_burgs_by_feature — pure scanner", () => {
  it("returns every active burg for a feature with multiple burgs", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    // feature 1: burgs 1, 2, 4 (7 removed, 9 out-of-bounds)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(1)?.capital).toBe(true);
    expect(byId.get(2)?.capital).toBe(false);
    expect(byId.get(4)?.capital).toBe(false);
  });

  it("returns burgs for a second feature cleanly (no cross-contamination)", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([3, 5]));
    expect(result.count).toBe(2);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(3)?.capital).toBe(false);
    expect(byId.get(5)?.capital).toBe(true);
  });

  it("returns burgs for a feature with null name (unnamed ocean)", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      4,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([6, 10]));
    expect(result.count).toBe(2);
  });

  it("returns empty list when the feature has no burgs", () => {
    // feature 3 (Mirror lake): no cell in cells.f points to it.
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed burgs", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("skips burgs whose cell is out-of-bounds in cells.f", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(9)).toBe(false);
  });

  it("skips burgs missing a cell field", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(8)).toBe(false);
  });

  it("truncates `burgs` at limit but preserves full `count`", () => {
    const result = findBurgsByFeatureInPack(asPack(makePack()), 1, 2) as {
      burgs: Array<{ i: number }>;
      count: number;
    };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates x, y, name, population, capital from the raw burg", () => {
    const result = findBurgsByFeatureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as {
      burgs: Array<{
        i: number;
        name: string;
        x: number;
        y: number;
        population: number;
        capital: boolean;
      }>;
    };
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(5)).toEqual({
      i: 5,
      name: "Emberkeep",
      x: 320,
      y: 410,
      population: 8.0,
      capital: true,
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findBurgsByFeatureInPack(
        undefined,
        1,
        DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {
      cells: { f: [] },
    } as unknown as Parameters<typeof findBurgsByFeatureInPack>[0];
    expect(
      findBurgsByFeatureInPack(pack, 1, DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.f is missing", () => {
    const pack = {
      burgs: [{ i: 0 }],
    } as unknown as Parameters<typeof findBurgsByFeatureInPack>[0];
    expect(
      findBurgsByFeatureInPack(pack, 1, DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT),
    ).toBe("not-ready");
  });
});

describe("resolveFeatureRefInPack", () => {
  it("resolves numeric id with type + name", () => {
    expect(resolveFeatureRefInPack(asPack(makePack()), 1)).toEqual({
      i: 1,
      type: "island",
      name: "Isle",
    });
  });

  it("resolves an unnamed feature with name:null", () => {
    expect(resolveFeatureRefInPack(asPack(makePack()), 4)).toEqual({
      i: 4,
      type: "ocean",
      name: null,
    });
  });

  it("returns 'not-found' for the placeholder slot (id 0)", () => {
    expect(resolveFeatureRefInPack(asPack(makePack()), 0)).toBe("not-found");
  });

  it("returns 'not-found' for negative id", () => {
    expect(resolveFeatureRefInPack(asPack(makePack()), -1)).toBe("not-found");
  });

  it("returns 'not-found' for out-of-range id", () => {
    expect(resolveFeatureRefInPack(asPack(makePack()), 99)).toBe("not-found");
  });

  it("returns 'not-found' for empty slot (value 0 in-range)", () => {
    expect(resolveFeatureRefInPack(asPack(makePack()), 5)).toBe("not-found");
  });

  it("returns 'not-ready' when features missing", () => {
    const pack = {} as unknown as Parameters<typeof resolveFeatureRefInPack>[0];
    expect(resolveFeatureRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_burgs_by_feature — tool surface", () => {
  it("returns ok=true with resolved feature, burgs, and count", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.feature).toEqual({ i: 1, type: "island", name: "Isle" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("echoes feature for a second feature cleanly", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.feature).toEqual({ i: 2, type: "continent", name: "Main" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("surfaces name:null for unnamed ocean features", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.feature).toEqual({ i: 4, type: "ocean", name: null });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([6, 10]),
    );
    expect(body.count).toBe(2);
  });

  it("rejects missing / invalid feature", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    for (const bad of [
      {},
      { feature: null },
      { feature: "1" },
      { feature: 0 },
      { feature: -1 },
      { feature: 1.5 },
      { feature: true },
      { feature: "Isle" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /feature must be an integer >= 1/i,
      );
    }
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no feature found/i);
  });

  it("surfaces 'not-found' for empty slot", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no feature found/i);
  });

  it("surfaces 'not-ready' from resolveFeature as a structured error", async () => {
    const tool = createFindBurgsByFeatureTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ feature: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindBurgsByFeatureTool(
      runtimeReturning({
        resolve: { i: 1, type: "island", name: "Isle" },
        find: "not-ready",
      }),
    );
    const result = await tool.execute({ feature: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    for (const bad of [
      { feature: 1, limit: 0 },
      { feature: 1, limit: -1 },
      { feature: 1, limit: 1.5 },
      { feature: 1, limit: "10" },
      { feature: 1, limit: MAX_FIND_BURGS_BY_FEATURE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindBurgsByFeatureRuntime = {
      resolveFeature: () => ({ i: 1, type: "island", name: "Isle" }),
      find: (_featureI, limit) => {
        receivedLimit = limit;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByFeatureTool(runtime);
    await tool.execute({ feature: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT);
  });

  it("returns empty list when the feature has no burgs", async () => {
    const tool = createFindBurgsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.feature).toEqual({ i: 3, type: "lake", name: "Mirror" });
    expect(body.burgs).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findBurgsByFeatureTool with the expected schema", () => {
    expect(findBurgsByFeatureTool.name).toBe("find_burgs_by_feature");
    expect(findBurgsByFeatureTool.input_schema.type).toBe("object");
    expect(findBurgsByFeatureTool.input_schema.required).toEqual(["feature"]);
    expect(
      findBurgsByFeatureTool.input_schema.properties.feature,
    ).toBeDefined();
    expect(findBurgsByFeatureTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_BY_FEATURE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindBurgsByFeatureRuntime integration -----

describe("defaultFindBurgsByFeatureRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a feature via the default runtime", () => {
    expect(defaultFindBurgsByFeatureRuntime.resolveFeature(1)).toEqual({
      i: 1,
      type: "island",
      name: "Isle",
    });
  });

  it("finds burgs via the default runtime for feature 1", () => {
    const result = defaultFindBurgsByFeatureRuntime.find(
      1,
      DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end for feature 2", async () => {
    const result = await findBurgsByFeatureTool.execute({ feature: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.feature).toEqual({ i: 2, type: "continent", name: "Main" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("tool uses default runtime end-to-end for unnamed ocean feature", async () => {
    const result = await findBurgsByFeatureTool.execute({ feature: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.feature).toEqual({ i: 4, type: "ocean", name: null });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([6, 10]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindBurgsByFeatureRuntime.resolveFeature(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindBurgsByFeatureRuntime.find(
        1,
        DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findBurgsByFeatureTool.execute({ feature: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
