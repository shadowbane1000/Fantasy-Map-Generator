import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLargestFeaturesTool,
  DEFAULT_FIND_LARGEST_FEATURES_BY,
  DEFAULT_FIND_LARGEST_FEATURES_N,
  defaultFindLargestFeaturesRuntime,
  FIND_LARGEST_FEATURES_METRICS,
  FIND_LARGEST_FEATURES_TYPE_FILTERS,
  type FindLargestFeaturesMetric,
  type FindLargestFeaturesResult,
  type FindLargestFeaturesRuntime,
  type FindLargestFeaturesTypeFilter,
  findLargestFeaturesInPack,
  findLargestFeaturesTool,
  MAX_FIND_LARGEST_FEATURES_N,
} from "./find-largest-features";

interface FakeFeature {
  i?: number;
  type?: string;
  group?: string;
  name?: string;
  land?: boolean;
  border?: boolean;
  cells?: number;
  area?: number;
}

interface FakePack {
  features: Array<FakeFeature | 0 | undefined | null>;
}

function makePack(): FakePack {
  // Features (index 0 is placeholder):
  //   1 Elderland  island/continent  land  area=4200  cells=1250
  //   2 (ocean)    ocean             water area=12000 cells=3000  border
  //   3 Mirror     lake/freshwater   water area=45    cells=12
  //   4 Lonely     island/isle       land  area=80    cells=40
  //   5 Shardsea   ocean             water area=8000  cells=2200  border
  //   6 Greatland  island/continent  land  area=9500  cells=2700
  //   undefined slot (should be skipped)
  return {
    features: [
      0,
      {
        i: 1,
        type: "island",
        group: "continent",
        name: "Elderland",
        land: true,
        border: false,
        cells: 1250,
        area: 4200,
      },
      {
        i: 2,
        type: "ocean",
        group: "ocean",
        land: false,
        border: true,
        cells: 3000,
        area: 12000,
      },
      {
        i: 3,
        type: "lake",
        group: "freshwater",
        name: "Mirror Lake",
        land: false,
        border: false,
        cells: 12,
        area: 45,
      },
      {
        i: 4,
        type: "island",
        group: "isle",
        name: "Lonely Isle",
        land: true,
        border: false,
        cells: 40,
        area: 80,
      },
      {
        i: 5,
        type: "ocean",
        group: "ocean",
        name: "Shardsea",
        land: false,
        border: true,
        cells: 2200,
        area: 8000,
      },
      {
        i: 6,
        type: "island",
        group: "continent",
        name: "Greatland",
        land: true,
        border: false,
        cells: 2700,
        area: 9500,
      },
      undefined,
    ],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findLargestFeaturesInPack>[0];
}

function runtimeReturning(
  result: FindLargestFeaturesResult,
): FindLargestFeaturesRuntime {
  return {
    find: () => result,
  };
}

function realRuntime(): FindLargestFeaturesRuntime {
  const pack = makePack();
  return {
    find: (n, by, typeFilter) =>
      findLargestFeaturesInPack(asPack(pack), n, by, typeFilter),
  };
}

describe("find_largest_features — pure ranker", () => {
  it("ranks by area descending (default) across all types", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      DEFAULT_FIND_LARGEST_FEATURES_N,
      "area",
      null,
    ) as { features: Array<{ i: number; area: number }> };
    // All: 2(12000), 6(9500), 5(8000), 1(4200), 4(80), 3(45)
    expect(result.features.map((f) => f.i)).toEqual([2, 6, 5, 1, 4, 3]);
    expect(result.features[0].area).toBe(12000);
  });

  it("ranks by cells descending", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      10,
      "cells",
      null,
    ) as { features: Array<{ i: number; cells: number }> };
    // 2(3000), 6(2700), 5(2200), 1(1250), 4(40), 3(12)
    expect(result.features.map((f) => f.i)).toEqual([2, 6, 5, 1, 4, 3]);
    expect(result.features[0].cells).toBe(3000);
  });

  it("filters by type=continent (group=continent only)", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      10,
      "area",
      "continent",
    ) as { features: Array<{ i: number; group: string | null }> };
    expect(result.features.map((f) => f.i)).toEqual([6, 1]);
    for (const f of result.features) expect(f.group).toBe("continent");
  });

  it("filters by type=island (raw type — includes continents and isles)", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      10,
      "area",
      "island",
    ) as { features: Array<{ i: number; type: string | null }> };
    // islands: 6(9500), 1(4200), 4(80)
    expect(result.features.map((f) => f.i)).toEqual([6, 1, 4]);
    for (const f of result.features) expect(f.type).toBe("island");
  });

  it("filters by type=lake", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      10,
      "area",
      "lake",
    ) as { features: Array<{ i: number; type: string | null }> };
    expect(result.features.map((f) => f.i)).toEqual([3]);
    expect(result.features[0].type).toBe("lake");
  });

  it("filters by type=ocean", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      10,
      "area",
      "ocean",
    ) as { features: Array<{ i: number; type: string | null }> };
    expect(result.features.map((f) => f.i)).toEqual([2, 5]);
    for (const f of result.features) expect(f.type).toBe("ocean");
  });

  it("slices to top n after filtering", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      1,
      "area",
      "island",
    ) as { features: Array<{ i: number }> };
    expect(result.features.map((f) => f.i)).toEqual([6]);
  });

  it("n larger than population returns all matches", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      500,
      "area",
      null,
    ) as { features: Array<{ i: number }> };
    expect(result.features).toHaveLength(6);
  });

  it("skips index-0 placeholder and falsy slots", () => {
    const result = findLargestFeaturesInPack(
      asPack(makePack()),
      500,
      "area",
      null,
    ) as { features: Array<{ i: number }> };
    const ids = new Set(result.features.map((f) => f.i));
    expect(ids.has(0)).toBe(false);
    expect(result.features).toHaveLength(6);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findLargestFeaturesInPack(undefined, 10, "area", null)).toBe(
      "not-ready",
    );
  });

  it("returns 'not-ready' when pack.features is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findLargestFeaturesInPack
    >[0];
    expect(findLargestFeaturesInPack(pack, 10, "area", null)).toBe("not-ready");
  });

  it("empty pack.features (only placeholder) yields empty result", () => {
    const pack = { features: [0] } as unknown as Parameters<
      typeof findLargestFeaturesInPack
    >[0];
    const result = findLargestFeaturesInPack(pack, 10, "area", null) as {
      features: unknown[];
    };
    expect(result.features).toEqual([]);
  });

  it("treats missing numeric fields as 0", () => {
    const pack = {
      features: [
        0,
        { i: 1, type: "island", land: true },
        { i: 2, type: "island", area: 5, land: true },
      ],
    } as unknown as Parameters<typeof findLargestFeaturesInPack>[0];
    const result = findLargestFeaturesInPack(pack, 10, "area", null) as {
      features: Array<{ i: number; area: number; cells: number }>;
    };
    expect(result.features[0].i).toBe(2);
    expect(result.features[0].area).toBe(5);
    expect(result.features[1].area).toBe(0);
    expect(result.features[1].cells).toBe(0);
  });

  it("falls back to slot index when entry.i is missing", () => {
    const pack = {
      features: [0, { type: "island", land: true, area: 1 }],
    } as unknown as Parameters<typeof findLargestFeaturesInPack>[0];
    const result = findLargestFeaturesInPack(pack, 10, "area", null) as {
      features: Array<{ i: number }>;
    };
    expect(result.features[0].i).toBe(1);
  });

  it("normalizes empty / missing name to null", () => {
    const pack = {
      features: [
        0,
        { i: 1, type: "ocean", group: "ocean", name: "", area: 10 },
      ],
    } as unknown as Parameters<typeof findLargestFeaturesInPack>[0];
    const result = findLargestFeaturesInPack(pack, 10, "area", null) as {
      features: Array<{ name: string | null }>;
    };
    expect(result.features[0].name).toBeNull();
  });
});

describe("find_largest_features — tool surface", () => {
  it("returns ok=true with top N ranked features (default by=area, no type filter)", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(3);
    expect(body.by).toBe("area");
    expect(body.type_filter).toBeNull();
    expect(body.features.map((f: { i: number }) => f.i)).toEqual([2, 6, 5]);
    expect(body.count).toBe(3);
  });

  it("defaults n to DEFAULT_FIND_LARGEST_FEATURES_N when omitted", async () => {
    let receivedN = -1;
    const runtime: FindLargestFeaturesRuntime = {
      find: (n, _by, _type) => {
        receivedN = n;
        return { features: [] };
      },
    };
    const tool = createFindLargestFeaturesTool(runtime);
    await tool.execute({});
    expect(receivedN).toBe(DEFAULT_FIND_LARGEST_FEATURES_N);
  });

  it("defaults by to DEFAULT_FIND_LARGEST_FEATURES_BY when omitted", async () => {
    let receivedBy: FindLargestFeaturesMetric | null = null;
    const runtime: FindLargestFeaturesRuntime = {
      find: (_n, by, _type) => {
        receivedBy = by;
        return { features: [] };
      },
    };
    const tool = createFindLargestFeaturesTool(runtime);
    await tool.execute({});
    expect(receivedBy).toBe(DEFAULT_FIND_LARGEST_FEATURES_BY);
  });

  it("defaults type filter to null when omitted", async () => {
    let receivedType: FindLargestFeaturesTypeFilter | null | "unset" = "unset";
    const runtime: FindLargestFeaturesRuntime = {
      find: (_n, _by, typeFilter) => {
        receivedType = typeFilter;
        return { features: [] };
      },
    };
    const tool = createFindLargestFeaturesTool(runtime);
    await tool.execute({});
    expect(receivedType).toBeNull();
  });

  it("accepts case-insensitive by", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    for (const input of ["CELLS", "Cells", " cells "]) {
      const r = await tool.execute({ by: input, n: 1 });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.by).toBe("cells");
      expect(body.features[0].i).toBe(2);
    }
  });

  it("accepts case-insensitive type", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    for (const input of ["CONTINENT", "Continent", " continent "]) {
      const r = await tool.execute({ type: input });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.type_filter).toBe("continent");
      expect(body.features.map((f: { i: number }) => f.i)).toEqual([6, 1]);
    }
  });

  it("ranks by cells when by='cells'", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    const r = await tool.execute({ by: "cells" });
    const body = JSON.parse(r.content);
    expect(body.by).toBe("cells");
    expect(body.features.map((f: { i: number }) => f.i)).toEqual([
      2, 6, 5, 1, 4, 3,
    ]);
  });

  it("rejects invalid by", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    for (const bad of ["size", "", "pop", 42, true]) {
      const r = await tool.execute({ by: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/by must be one of/);
    }
  });

  it("rejects invalid type", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    for (const bad of ["swamp", "", "   ", 42, true]) {
      const r = await tool.execute({ type: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/type must be one of/);
    }
  });

  it("rejects invalid n", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: 1.5 },
      { n: "10" },
      { n: MAX_FIND_LARGEST_FEATURES_N + 1 },
      { n: Number.NaN },
      { n: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/);
    }
  });

  it("returns empty features when filter matches nothing", async () => {
    const runtime: FindLargestFeaturesRuntime = {
      find: () => ({ features: [] }),
    };
    const t = createFindLargestFeaturesTool(runtime);
    const r = await t.execute({ type: "lake" });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.features).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.type_filter).toBe("lake");
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindLargestFeaturesTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLargestFeaturesTool with the expected schema", () => {
    expect(findLargestFeaturesTool.name).toBe("find_largest_features");
    expect(findLargestFeaturesTool.input_schema.type).toBe("object");
    expect(findLargestFeaturesTool.input_schema.properties.n).toBeDefined();
    expect(findLargestFeaturesTool.input_schema.properties.by).toBeDefined();
    expect(findLargestFeaturesTool.input_schema.properties.type).toBeDefined();
    const bySchema = findLargestFeaturesTool.input_schema.properties
      .by as unknown as { enum?: string[] };
    expect(bySchema.enum).toEqual([...FIND_LARGEST_FEATURES_METRICS]);
    const typeSchema = findLargestFeaturesTool.input_schema.properties
      .type as unknown as { enum?: string[] };
    expect(typeSchema.enum).toEqual([...FIND_LARGEST_FEATURES_TYPE_FILTERS]);
  });

  it("exposes DEFAULT and MAX n + metric + type constants", () => {
    expect(DEFAULT_FIND_LARGEST_FEATURES_N).toBe(10);
    expect(MAX_FIND_LARGEST_FEATURES_N).toBe(500);
    expect(DEFAULT_FIND_LARGEST_FEATURES_BY).toBe("area");
    expect(FIND_LARGEST_FEATURES_METRICS).toEqual(["area", "cells"]);
    expect(FIND_LARGEST_FEATURES_TYPE_FILTERS).toEqual([
      "island",
      "lake",
      "ocean",
      "continent",
    ]);
  });

  it("echoes requested_n, by, and type_filter on the response", async () => {
    const tool = createFindLargestFeaturesTool(realRuntime());
    const result = await tool.execute({ n: 2, by: "cells", type: "ocean" });
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(2);
    expect(body.by).toBe("cells");
    expect(body.type_filter).toBe("ocean");
    expect(body.features).toHaveLength(2);
  });
});

// ----- defaultFindLargestFeaturesRuntime integration -----

describe("defaultFindLargestFeaturesRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultFindLargestFeaturesRuntime.find(3, "area", null) as {
      features: Array<{ i: number }>;
    };
    expect(result.features.map((f) => f.i)).toEqual([2, 6, 5]);
  });

  it("applies type filter via the default runtime", () => {
    const result = defaultFindLargestFeaturesRuntime.find(
      10,
      "area",
      "continent",
    ) as { features: Array<{ i: number; group: string | null }> };
    expect(result.features.map((f) => f.i)).toEqual([6, 1]);
    for (const f of result.features) expect(f.group).toBe("continent");
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findLargestFeaturesTool.execute({
      n: 1,
      by: "area",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.features).toHaveLength(1);
    expect(body.features[0].i).toBe(2);
    expect(body.features[0].type).toBe("ocean");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLargestFeaturesRuntime.find(10, "area", null)).toBe(
      "not-ready",
    );
    const result = await findLargestFeaturesTool.execute({ n: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
