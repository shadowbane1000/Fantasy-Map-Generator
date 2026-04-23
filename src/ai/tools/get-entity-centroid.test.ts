import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CollectEntityCentroidResult,
  computeEntityCentroid,
  createGetEntityCentroidTool,
  defaultGetEntityCentroidRuntime,
  type GetEntityCentroidRuntime,
  getEntityCentroidTool,
} from "./get-entity-centroid";

interface FakeEntity {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
}

interface FakePack {
  cells: {
    i: number[];
    p: [number, number][];
    state: number[];
    province: number[];
    culture: number[];
    religion: number[];
    biome: number[];
  };
  states: FakeEntity[];
  provinces: FakeEntity[];
  cultures: FakeEntity[];
  religions: FakeEntity[];
}

interface FakeBiomesData {
  i: number[];
  name: string[];
}

function makePack(): FakePack {
  // 8 cells with known coordinates so we can compute exact centroids.
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      p: [
        [0, 0],
        [10, 20], // state 3
        [20, 40], // state 3
        [30, 60], // state 3
        [100, 100], // state 5
        [200, 200], // state 5
        [0, 0],
        [40, 80], // state 3
      ],
      state: [0, 3, 3, 3, 5, 5, 0, 3],
      province: [0, 4, 4, 2, 4, 2, 0, 2],
      culture: [0, 2, 7, 2, 2, 7, 0, 2],
      religion: [0, 5, 5, 1, 5, 1, 1, 5],
      biome: [0, 1, 1, 2, 2, 2, 0, 1],
    },
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Ghostland", removed: true },
      undefined as unknown as FakeEntity,
      { i: 3, name: "Altaria", fullName: "Kingdom of Altaria" },
      undefined as unknown as FakeEntity,
      { i: 5, name: "Brumaria" },
    ],
    provinces: [
      { i: 0, name: "Placeholder" },
      undefined as unknown as FakeEntity,
      { i: 2, name: "Rookmark" },
      undefined as unknown as FakeEntity,
      { i: 4, name: "Stormreach" },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      undefined as unknown as FakeEntity,
      { i: 2, name: "Highlanders" },
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      { i: 7, name: "Marshfolk" },
    ],
    religions: [
      { i: 0, name: "No religion" },
      { i: 1, name: "Old Faith" },
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      { i: 5, name: "Stormcult" },
    ],
  };
}

function makeBiomes(): FakeBiomesData {
  return {
    i: [0, 1, 2, 3],
    name: ["Marine", "Grassland", "Hot desert", "removed"],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof computeEntityCentroid>[0];
}

function asBiomes(b: FakeBiomesData | undefined) {
  return b as unknown as Parameters<typeof computeEntityCentroid>[1];
}

function runtimeReturning(
  result: CollectEntityCentroidResult,
): GetEntityCentroidRuntime {
  return { compute: () => result };
}

function realRuntime(): GetEntityCentroidRuntime {
  const pack = asPack(makePack());
  const biomes = asBiomes(makeBiomes());
  return {
    compute: (type, ref) => computeEntityCentroid(pack, biomes, type, ref),
  };
}

describe("get_entity_centroid — pure collector", () => {
  it("computes centroid for a state by numeric id (mean of 4 cells)", () => {
    // state 3 is at cells 1, 2, 3, 7 with coords (10,20) (20,40) (30,60) (40,80)
    // mean: (100/4, 200/4) = (25, 50)
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "state",
      3,
    );
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      centroid: { x: 25, y: 50 },
      cellsCount: 4,
    });
  });

  it("resolves a state by case-insensitive name", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "state",
      "altaria",
    );
    expect(result).toMatchObject({
      i: 3,
      centroid: { x: 25, y: 50 },
      cellsCount: 4,
    });
  });

  it("resolves a state by fullName", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "state",
      "Kingdom of Altaria",
    );
    expect(result).toMatchObject({ i: 3, cellsCount: 4 });
  });

  it("computes centroid for a province", () => {
    // province 2: cells 3, 5, 7 => (30,60) (200,200) (40,80)
    // mean: ((30+200+40)/3, (60+200+80)/3) = (270/3, 340/3) = (90, 113.333...)
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "province",
      "Rookmark",
    );
    expect(result?.valueOf()).toBeTruthy();
    const hit = result as Extract<
      CollectEntityCentroidResult,
      { cellsCount: number }
    >;
    expect(hit.i).toBe(2);
    expect(hit.cellsCount).toBe(3);
    expect(hit.centroid).not.toBeNull();
    expect(hit.centroid?.x).toBeCloseTo(90, 10);
    expect(hit.centroid?.y).toBeCloseTo(340 / 3, 10);
  });

  it("computes centroid for a culture", () => {
    // culture 7: cells 2, 5 => (20, 40) and (200, 200)
    // mean: (110, 120)
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "culture",
      "Marshfolk",
    );
    expect(result).toMatchObject({
      i: 7,
      centroid: { x: 110, y: 120 },
      cellsCount: 2,
    });
  });

  it("computes centroid for a religion", () => {
    // religion 5: cells 1, 2, 4, 7 => (10,20) (20,40) (100,100) (40,80)
    // sum: (170, 240); mean: (42.5, 60)
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "religion",
      5,
    );
    expect(result).toMatchObject({
      i: 5,
      name: "Stormcult",
      centroid: { x: 42.5, y: 60 },
      cellsCount: 4,
    });
  });

  it("computes centroid for a biome by id", () => {
    // biome 1: cells 1, 2, 7 => (10,20) (20,40) (40,80); mean (70/3, 140/3)
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "biome",
      1,
    );
    const hit = result as Extract<
      CollectEntityCentroidResult,
      { cellsCount: number }
    >;
    expect(hit.i).toBe(1);
    expect(hit.name).toBe("Grassland");
    expect(hit.cellsCount).toBe(3);
    expect(hit.centroid?.x).toBeCloseTo(70 / 3, 10);
    expect(hit.centroid?.y).toBeCloseTo(140 / 3, 10);
  });

  it("computes centroid for biome 0 (Marine) — non-negative id allowed", () => {
    // biome 0: cells 0, 6 => (0,0) and (0,0); mean (0, 0)
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "biome",
      0,
    );
    expect(result).toMatchObject({
      i: 0,
      name: "Marine",
      centroid: { x: 0, y: 0 },
      cellsCount: 2,
    });
  });

  it("resolves biome by case-insensitive name", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "biome",
      "grassland",
    );
    expect(result).toMatchObject({ i: 1, name: "Grassland", cellsCount: 3 });
  });

  it("returns 'unknown-entity' for a retired biome slot ('removed' sentinel)", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "biome",
      3,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for an unknown biome name", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "biome",
      "Tundra",
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns centroid=null, cellsCount=0 when no cell points at the entity", () => {
    const pack = makePack();
    for (let k = 0; k < pack.cells.province.length; k++) {
      if (pack.cells.province[k] === 4) pack.cells.province[k] = 0;
    }
    const result = computeEntityCentroid(
      asPack(pack),
      asBiomes(makeBiomes()),
      "province",
      4,
    );
    expect(result).toMatchObject({ i: 4, centroid: null, cellsCount: 0 });
  });

  it("returns centroid=null when the cells field is absent but entity resolves", () => {
    const pack = makePack();
    const mutated = {
      ...pack,
      cells: {
        i: pack.cells.i,
        p: pack.cells.p,
        // state field omitted
        province: pack.cells.province,
        culture: pack.cells.culture,
        religion: pack.cells.religion,
        biome: pack.cells.biome,
      },
    };
    const result = computeEntityCentroid(
      mutated as unknown as Parameters<typeof computeEntityCentroid>[0],
      asBiomes(makeBiomes()),
      "state",
      3,
    );
    expect(result).toMatchObject({ i: 3, centroid: null, cellsCount: 0 });
  });

  it("skips malformed p[k] entries (missing / non-numeric)", () => {
    const pack = makePack();
    // Null out cell 1's point so only 2, 3, 7 contribute to state 3.
    // Cells 2, 3, 7 => (20,40) (30,60) (40,80); mean (30, 60).
    (pack.cells.p as unknown as Array<[number, number] | null>)[1] = null;
    const result = computeEntityCentroid(
      asPack(pack),
      asBiomes(makeBiomes()),
      "state",
      3,
    );
    expect(result).toMatchObject({
      i: 3,
      centroid: { x: 30, y: 60 },
      cellsCount: 3,
    });
  });

  it("returns 'unknown-entity' for a removed state", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "state",
      1,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for an unresolvable name", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "state",
      "Nowhereland",
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' when ref points at index 0 placeholder", () => {
    const result = computeEntityCentroid(
      asPack(makePack()),
      asBiomes(makeBiomes()),
      "state",
      0 as unknown as number,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      computeEntityCentroid(undefined, asBiomes(makeBiomes()), "state", 1),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.i is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof computeEntityCentroid
    >[0];
    expect(
      computeEntityCentroid(pack, asBiomes(makeBiomes()), "state", 1),
    ).toBe("not-ready");
  });
});

describe("get_entity_centroid — tool surface", () => {
  it("returns ok=true with centroid and cells_count", async () => {
    const tool = createGetEntityCentroidTool(realRuntime());
    const result = await tool.execute({ entity_type: "state", entity: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      entity_type: "state",
      i: 3,
      name: "Altaria",
      centroid: { x: 25, y: 50 },
      cells_count: 4,
    });
  });

  it("accepts entity_type case-insensitively", async () => {
    const tool = createGetEntityCentroidTool(realRuntime());
    for (const input of [
      { entity_type: "STATE", entity: 3 },
      { entity_type: "Province", entity: "Rookmark" },
      { entity_type: "ReLiGion", entity: 1 },
      { entity_type: "Biome", entity: 1 },
    ]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content).ok).toBe(true);
    }
  });

  it("returns centroid: null when the entity has no cells", async () => {
    // Build a runtime where province 4 has its cells cleared.
    const pack = makePack();
    for (let k = 0; k < pack.cells.province.length; k++) {
      if (pack.cells.province[k] === 4) pack.cells.province[k] = 0;
    }
    const packRef = asPack(pack);
    const biomes = asBiomes(makeBiomes());
    const tool = createGetEntityCentroidTool({
      compute: (type, ref) => computeEntityCentroid(packRef, biomes, type, ref),
    });
    const result = await tool.execute({
      entity_type: "province",
      entity: 4,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.centroid).toBeNull();
    expect(body.cells_count).toBe(0);
  });

  it("rejects unknown entity_type", async () => {
    const tool = createGetEntityCentroidTool(realRuntime());
    for (const bad of [
      { entity_type: "burg", entity: 1 },
      { entity_type: "", entity: 1 },
      { entity_type: 7, entity: 1 },
      { entity: 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/entity_type must be one of/);
    }
  });

  it("rejects missing / invalid entity for non-biome", async () => {
    const tool = createGetEntityCentroidTool(realRuntime());
    for (const bad of [
      { entity_type: "state" },
      { entity_type: "state", entity: 0 },
      { entity_type: "state", entity: -1 },
      { entity_type: "state", entity: 1.5 },
      { entity_type: "state", entity: "" },
      { entity_type: "state", entity: null },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a positive integer id or a non-empty name string/,
      );
    }
  });

  it("rejects negative biome id but accepts biome 0 (Marine)", async () => {
    const tool = createGetEntityCentroidTool(realRuntime());
    const bad = await tool.execute({ entity_type: "biome", entity: -1 });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.content).error).toMatch(
      /non-negative integer id or a non-empty name string/,
    );
    const ok = await tool.execute({ entity_type: "biome", entity: 0 });
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(ok.content).ok).toBe(true);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetEntityCentroidTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'unknown-entity' as a structured error", async () => {
    const tool = createGetEntityCentroidTool(
      runtimeReturning("unknown-entity"),
    );
    const r = await tool.execute({
      entity_type: "province",
      entity: "Nowhere",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /Could not resolve province "Nowhere"\./,
    );
  });

  it("is exported as getEntityCentroidTool with the expected schema", () => {
    expect(getEntityCentroidTool.name).toBe("get_entity_centroid");
    expect(getEntityCentroidTool.input_schema.type).toBe("object");
    expect(getEntityCentroidTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
    ]);
    expect(
      getEntityCentroidTool.input_schema.properties.entity_type,
    ).toBeDefined();
    expect(getEntityCentroidTool.input_schema.properties.entity).toBeDefined();
  });
});

// ----- defaultGetEntityCentroidRuntime integration -----

describe("defaultGetEntityCentroidRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    biomesData?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalBiomes = globalsRef.biomesData;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.biomesData = makeBiomes() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.biomesData = originalBiomes;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultGetEntityCentroidRuntime.compute("state", 3);
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      centroid: { x: 25, y: 50 },
      cellsCount: 4,
    });
  });

  it("resolves biome via globalThis.biomesData", async () => {
    const result = await getEntityCentroidTool.execute({
      entity_type: "biome",
      entity: "Grassland",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "biome",
      i: 1,
      name: "Grassland",
      cells_count: 3,
    });
    expect(body.centroid.x).toBeCloseTo(70 / 3, 10);
    expect(body.centroid.y).toBeCloseTo(140 / 3, 10);
  });

  it("tool uses default runtime to resolve against globalThis.pack", async () => {
    const result = await getEntityCentroidTool.execute({
      entity_type: "religion",
      entity: "Stormcult",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "religion",
      i: 5,
      centroid: { x: 42.5, y: 60 },
      cells_count: 4,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultGetEntityCentroidRuntime.compute("state", 3)).toBe(
      "not-ready",
    );
    const result = await getEntityCentroidTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
