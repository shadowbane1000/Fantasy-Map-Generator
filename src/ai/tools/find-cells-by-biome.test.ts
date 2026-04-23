import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsByBiomeTool,
  DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
  defaultFindCellsByBiomeRuntime,
  type FindCellsByBiomeResult,
  type FindCellsByBiomeRuntime,
  findBiomeCellsInPack,
  findCellsByBiomeTool,
  MAX_FIND_CELLS_BY_BIOME_LIMIT,
} from "./find-cells-by-biome";

interface FakeBiomesData {
  i: number[];
  name: string[];
}

interface FakePack {
  cells: {
    biome: number[];
  };
}

function makeBiomesData(): FakeBiomesData {
  // id 0 = Marine, 1 = Hot desert, 2 = Grassland, 3 = "removed" (retired slot),
  // 4 = Temperate forest, 5 = Highland.
  return {
    i: [0, 1, 2, 3, 4, 5],
    name: [
      "Marine",
      "Hot desert",
      "Grassland",
      "removed",
      "Temperate forest",
      "Highland",
    ],
  };
}

function makePack(): FakePack {
  // 10 cells distributed across the biomes (id 3 should never appear
  // because it's the retired slot).
  return {
    cells: {
      biome: [0, 0, 1, 2, 2, 2, 4, 5, 5, 0],
    },
  };
}

function asBiomesData(b: FakeBiomesData) {
  return b as unknown as Parameters<typeof findBiomeCellsInPack>[0];
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBiomeCellsInPack>[1];
}

function runtimeReturning(
  result: FindCellsByBiomeResult,
): FindCellsByBiomeRuntime {
  return { collect: () => result };
}

function realRuntime(): FindCellsByBiomeRuntime {
  const biomesData = asBiomesData(makeBiomesData());
  const pack = asPack(makePack());
  return {
    collect: (ref, limit) => findBiomeCellsInPack(biomesData, pack, ref, limit),
  };
}

describe("find_cells_by_biome — pure collector", () => {
  it("collects every cell for a biome by numeric id", () => {
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      2,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Grassland",
      cells: [3, 4, 5],
      count: 3,
    });
  });

  it("resolves a biome by case-insensitive name", () => {
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      "grassland",
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toMatchObject({ i: 2, name: "Grassland", cells: [3, 4, 5] });
  });

  it("collects cells for biome id 0 (Marine)", () => {
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      0,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toMatchObject({
      i: 0,
      name: "Marine",
      cells: [0, 1, 9],
      count: 3,
    });
  });

  it("returns empty cells and count=0 when no cell matches the biome", () => {
    const biomesData = makeBiomesData();
    const pack = makePack();
    // No cell points at biome 1 after we zero out.
    for (let k = 0; k < pack.cells.biome.length; k++) {
      if (pack.cells.biome[k] === 1) pack.cells.biome[k] = 0;
    }
    const result = findBiomeCellsInPack(
      asBiomesData(biomesData),
      asPack(pack),
      1,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toMatchObject({ i: 1, cells: [], count: 0 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      2,
      2,
    );
    expect(result).toMatchObject({ i: 2, cells: [3, 4], count: 3 });
  });

  it("returns 'not-found' for a retired (removed) slot", () => {
    // id 3 has name "removed" — findBiomeByRef must skip it.
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      3,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toBe("not-found");
  });

  it("returns 'not-found' for an unresolvable name", () => {
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      "Nowhere biome",
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toBe("not-found");
  });

  it("returns 'not-found' for an unknown numeric id", () => {
    const result = findBiomeCellsInPack(
      asBiomesData(makeBiomesData()),
      asPack(makePack()),
      99,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toBe("not-found");
  });

  it("returns 'not-ready' when biomesData is missing", () => {
    expect(
      findBiomeCellsInPack(
        undefined,
        asPack(makePack()),
        2,
        DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when biomesData.i is not an array", () => {
    const result = findBiomeCellsInPack(
      { name: ["Marine"] } as unknown as Parameters<
        typeof findBiomeCellsInPack
      >[0],
      asPack(makePack()),
      0,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toBe("not-ready");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findBiomeCellsInPack(
        asBiomesData(makeBiomesData()),
        undefined,
        0,
        DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.biome is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof findBiomeCellsInPack
    >[1];
    expect(
      findBiomeCellsInPack(
        asBiomesData(makeBiomesData()),
        pack,
        0,
        DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_cells_by_biome — tool surface", () => {
  it("returns ok=true with the resolved biome and cells", async () => {
    const tool = createFindCellsByBiomeTool(realRuntime());
    const result = await tool.execute({ biome: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      biome: { i: 2, name: "Grassland" },
      cells: [3, 4, 5],
      count: 3,
    });
  });

  it("accepts biome by case-insensitive name", async () => {
    const tool = createFindCellsByBiomeTool(realRuntime());
    const result = await tool.execute({ biome: "TEMPERATE FOREST" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.biome).toEqual({ i: 4, name: "Temperate forest" });
    expect(body.cells).toEqual([6]);
    expect(body.count).toBe(1);
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCellsByBiomeTool(realRuntime());
    const result = await tool.execute({ biome: 2, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(2);
    expect(body.count).toBe(3);
  });

  it("rejects missing / invalid biome", async () => {
    const tool = createFindCellsByBiomeTool(realRuntime());
    for (const bad of [
      {},
      { biome: -1 },
      { biome: 1.5 },
      { biome: "" },
      { biome: null },
      { biome: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /biome must be a non-negative integer id or a non-empty name string/,
      );
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsByBiomeTool(realRuntime());
    for (const bad of [
      { biome: 2, limit: 0 },
      { biome: 2, limit: -1 },
      { biome: 2, limit: 1.5 },
      { biome: 2, limit: "10" },
      { biome: 2, limit: MAX_FIND_CELLS_BY_BIOME_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsByBiomeTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ biome: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindCellsByBiomeTool(runtimeReturning("not-found"));
    const r = await tool.execute({ biome: "Nowhere" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /No biome found matching "Nowhere"\./,
    );
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsByBiomeRuntime = {
      collect: (_ref, limit) => {
        received = limit;
        return { i: 2, name: "Grassland", cells: [], count: 0 };
      },
    };
    const tool = createFindCellsByBiomeTool(runtime);
    await tool.execute({ biome: 2 });
    expect(received).toBe(DEFAULT_FIND_CELLS_BY_BIOME_LIMIT);
  });

  it("is exported as findCellsByBiomeTool with the expected schema", () => {
    expect(findCellsByBiomeTool.name).toBe("find_cells_by_biome");
    expect(findCellsByBiomeTool.input_schema.type).toBe("object");
    expect(findCellsByBiomeTool.input_schema.required).toEqual(["biome"]);
    expect(findCellsByBiomeTool.input_schema.properties.biome).toBeDefined();
    expect(findCellsByBiomeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_CELLS_BY_BIOME_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_BY_BIOME_LIMIT).toBe(100000);
  });
});

// ----- defaultFindCellsByBiomeRuntime integration -----

describe("defaultFindCellsByBiomeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    biomesData?: unknown;
    pack?: unknown;
  };
  const originalBiomesData = globalsRef.biomesData;
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.biomesData = makeBiomesData() as unknown;
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.biomesData = originalBiomesData;
    globalsRef.pack = originalPack;
  });

  it("reads real biomesData/pack via the default runtime (happy path)", () => {
    const result = defaultFindCellsByBiomeRuntime.collect(
      2,
      DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Grassland",
      cells: [3, 4, 5],
      count: 3,
    });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCellsByBiomeTool.execute({ biome: "Marine" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      biome: { i: 0, name: "Marine" },
      cells: [0, 1, 9],
      count: 3,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsByBiomeRuntime.collect(
        2,
        DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByBiomeTool.execute({ biome: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when biomesData is missing → tool surfaces error", async () => {
    globalsRef.biomesData = undefined;
    expect(
      defaultFindCellsByBiomeRuntime.collect(
        2,
        DEFAULT_FIND_CELLS_BY_BIOME_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByBiomeTool.execute({ biome: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
