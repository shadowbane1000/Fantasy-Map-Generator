import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsByFeatureTool,
  DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
  defaultFindCellsByFeatureRuntime,
  type FindCellsByFeaturePackLike,
  type FindCellsByFeatureResult,
  type FindCellsByFeatureRuntime,
  findCellsByFeatureTool,
  findFeatureCellsInPack,
  MAX_FIND_CELLS_BY_FEATURE_LIMIT,
} from "./find-cells-by-feature";

interface FakeFeature {
  i?: number;
  type?: string;
  name?: string;
}

interface FakePack {
  features: Array<FakeFeature | 0 | undefined>;
  cells: {
    f: number[];
  };
}

function makePack(): FakePack {
  return {
    // Index 0 is the placeholder. Features 1, 2, 3 are real; 4 is an
    // empty slot that must be treated as "not-found".
    features: [
      0,
      { i: 1, type: "island", name: "Elder Isle" },
      { i: 2, type: "ocean" }, // no name
      { i: 3, type: "lake", name: "Mirror Lake" },
      undefined,
    ],
    // 12 cells: 3× feature 1, 2× feature 2, 4× feature 3, rest unmatched.
    cells: {
      f: [1, 1, 2, 3, 3, 1, 2, 3, 3, 0, 0, 5],
    },
  };
}

function asPack(p: FakePack): FindCellsByFeaturePackLike {
  return p as unknown as FindCellsByFeaturePackLike;
}

function runtimeReturning(
  result: FindCellsByFeatureResult,
): FindCellsByFeatureRuntime {
  return { collect: () => result };
}

function realRuntime(): FindCellsByFeatureRuntime {
  const pack = asPack(makePack());
  return {
    collect: (featureId, limit) =>
      findFeatureCellsInPack(pack, featureId, limit),
  };
}

describe("find_cells_by_feature — pure collector", () => {
  it("collects every cell for a continent feature by id", () => {
    const result = findFeatureCellsInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({
      i: 1,
      type: "island",
      name: "Elder Isle",
      cells: [0, 1, 5],
      count: 3,
    });
  });

  it("collects cells for an ocean feature with no name (name=null)", () => {
    const result = findFeatureCellsInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      type: "ocean",
      name: null,
      cells: [2, 6],
      count: 2,
    });
  });

  it("collects cells for a lake feature", () => {
    const result = findFeatureCellsInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      type: "lake",
      name: "Mirror Lake",
      cells: [3, 4, 7, 8],
      count: 4,
    });
  });

  it("returns empty cells and count=0 when no cell matches the feature", () => {
    const pack = makePack();
    // Zero out every cell pointing at feature 1.
    for (let k = 0; k < pack.cells.f.length; k++) {
      if (pack.cells.f[k] === 1) pack.cells.f[k] = 0;
    }
    const result = findFeatureCellsInPack(
      asPack(pack),
      1,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({
      i: 1,
      cells: [],
      count: 0,
    });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findFeatureCellsInPack(asPack(makePack()), 3, 2);
    expect(result).toMatchObject({
      i: 3,
      cells: [3, 4],
      count: 4,
    });
  });

  it("falls back to the requested id when entry.i is missing", () => {
    const pack: FakePack = {
      features: [0, { type: "island", name: "Anon" }],
      cells: { f: [1, 1, 0] },
    };
    const result = findFeatureCellsInPack(
      asPack(pack),
      1,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({
      i: 1,
      type: "island",
      name: "Anon",
      cells: [0, 1],
      count: 2,
    });
  });

  it("empty-string name is normalised to null", () => {
    const pack: FakePack = {
      features: [0, { i: 1, type: "ocean", name: "" }],
      cells: { f: [1] },
    };
    const result = findFeatureCellsInPack(
      asPack(pack),
      1,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({ i: 1, name: null });
  });

  it("returns 'not-found' for feature id 0 (placeholder)", () => {
    expect(
      findFeatureCellsInPack(
        asPack(makePack()),
        0,
        DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-found");
  });

  it("returns 'not-found' for a negative feature id", () => {
    expect(
      findFeatureCellsInPack(
        asPack(makePack()),
        -1,
        DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-found");
  });

  it("returns 'not-found' for an out-of-range feature id", () => {
    expect(
      findFeatureCellsInPack(
        asPack(makePack()),
        999,
        DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-found");
  });

  it("returns 'not-found' for an empty / undefined slot", () => {
    expect(
      findFeatureCellsInPack(
        asPack(makePack()),
        4,
        DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-found");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findFeatureCellsInPack(undefined, 1, DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.features is missing", () => {
    const pack = {
      cells: { f: [1, 1] },
    } as unknown as FindCellsByFeaturePackLike;
    expect(
      findFeatureCellsInPack(pack, 1, DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.f is missing", () => {
    const pack = {
      features: [0, { i: 1, type: "island" }],
      cells: {},
    } as unknown as FindCellsByFeaturePackLike;
    expect(
      findFeatureCellsInPack(pack, 1, DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {
      features: [0, { i: 1, type: "island" }],
    } as unknown as FindCellsByFeaturePackLike;
    expect(
      findFeatureCellsInPack(pack, 1, DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT),
    ).toBe("not-ready");
  });
});

describe("find_cells_by_feature — tool surface", () => {
  it("returns ok=true with the resolved feature and cells", async () => {
    const tool = createFindCellsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      feature: { i: 1, type: "island", name: "Elder Isle" },
      cells: [0, 1, 5],
      count: 3,
    });
  });

  it("returns ok=true for an ocean feature with no name", async () => {
    const tool = createFindCellsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.feature).toEqual({ i: 2, type: "ocean", name: null });
    expect(body.cells).toEqual([2, 6]);
    expect(body.count).toBe(2);
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCellsByFeatureTool(realRuntime());
    const result = await tool.execute({ feature: 3, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(2);
    expect(body.count).toBe(4);
  });

  it("rejects missing / invalid feature", async () => {
    const tool = createFindCellsByFeatureTool(realRuntime());
    for (const bad of [
      {},
      { feature: "1" },
      { feature: 1.5 },
      { feature: null },
      { feature: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/integer/i);
    }
  });

  it("rejects feature <= 0 (placeholder / negative)", async () => {
    const tool = createFindCellsByFeatureTool(realRuntime());
    for (const bad of [{ feature: 0 }, { feature: -1 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/feature must be >= 1/);
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsByFeatureTool(realRuntime());
    for (const bad of [
      { feature: 1, limit: 0 },
      { feature: 1, limit: -1 },
      { feature: 1, limit: 1.5 },
      { feature: 1, limit: "10" },
      { feature: 1, limit: MAX_FIND_CELLS_BY_FEATURE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsByFeatureTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ feature: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindCellsByFeatureTool(runtimeReturning("not-found"));
    const r = await tool.execute({ feature: 42 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/No feature found matching 42/);
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsByFeatureRuntime = {
      collect: (_id, limit) => {
        received = limit;
        return { i: 1, type: "island", name: "X", cells: [], count: 0 };
      },
    };
    const tool = createFindCellsByFeatureTool(runtime);
    await tool.execute({ feature: 1 });
    expect(received).toBe(DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT);
  });

  it("is exported as findCellsByFeatureTool with the expected schema", () => {
    expect(findCellsByFeatureTool.name).toBe("find_cells_by_feature");
    expect(findCellsByFeatureTool.input_schema.type).toBe("object");
    expect(findCellsByFeatureTool.input_schema.required).toEqual(["feature"]);
    expect(
      findCellsByFeatureTool.input_schema.properties.feature,
    ).toBeDefined();
    expect(findCellsByFeatureTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_BY_FEATURE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindCellsByFeatureRuntime integration -----

describe("defaultFindCellsByFeatureRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultFindCellsByFeatureRuntime.collect(
      1,
      DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
    );
    expect(result).toMatchObject({
      i: 1,
      type: "island",
      name: "Elder Isle",
      cells: [0, 1, 5],
      count: 3,
    });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCellsByFeatureTool.execute({ feature: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      feature: { i: 3, type: "lake", name: "Mirror Lake" },
      cells: [3, 4, 7, 8],
      count: 4,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsByFeatureRuntime.collect(
        1,
        DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByFeatureTool.execute({ feature: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for an empty slot through the tool", async () => {
    const result = await findCellsByFeatureTool.execute({ feature: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });
});
