import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CollectEntityBboxResult,
  collectEntityBbox,
  createGetEntityBboxTool,
  defaultGetEntityBboxRuntime,
  type GetEntityBboxRuntime,
  getEntityBboxTool,
} from "./get-entity-bbox";

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

// 8 cells; centroids laid out so the bbox math is easy to hand-check:
//   cell:   0       1       2       3       4       5       6       7
//   p:      (0,0)   (10,0)  (20,0)  (0,10)  (10,10) (20,10) (0,20)  (10,20)
const FAKE_POINTS: [number, number][] = [
  [0, 0],
  [10, 0],
  [20, 0],
  [0, 10],
  [10, 10],
  [20, 10],
  [0, 20],
  [10, 20],
];

function makePack(): FakePack {
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      p: FAKE_POINTS.map((p) => [...p] as [number, number]),
      //   cell:   0 1 2 3 4 5 6 7
      //   state:  0 3 3 3 5 5 0 3   → state 3 cells: 1,2,3,7 → p: (10,0),(20,0),(0,10),(10,20) → bbox (0,0)-(20,20)
      state: [0, 3, 3, 3, 5, 5, 0, 3],
      //   province: 0 4 4 2 4 2 0 2  → province 4 cells: 1,2,4 → p: (10,0),(20,0),(10,10) → (10,0)-(20,10)
      province: [0, 4, 4, 2, 4, 2, 0, 2],
      //   culture: 0 2 7 2 2 7 0 2  → culture 2 cells: 1,3,4,7 → (0,0)-(10,20)
      culture: [0, 2, 7, 2, 2, 7, 0, 2],
      //   religion: 0 5 5 1 5 1 1 5 → religion 5 cells: 1,2,4,7 → (10,0)-(20,20)
      religion: [0, 5, 5, 1, 5, 1, 1, 5],
      //   biome:   1 1 2 3 2 3 2 1  → biome 2 cells: 2,4,6 → (0,0)-(20,20) via p (20,0),(10,10),(0,20)
      biome: [1, 1, 2, 3, 2, 3, 2, 1],
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

function makeBiomesData(): FakeBiomesData {
  return {
    i: [0, 1, 2, 3, 4],
    name: ["Marine", "Grassland", "Forest", "Desert", "removed"],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof collectEntityBbox>[0];
}

function asBiomes(b: FakeBiomesData) {
  return b as unknown as Parameters<typeof collectEntityBbox>[1];
}

function runtimeReturning(
  result: CollectEntityBboxResult,
): GetEntityBboxRuntime {
  return { collect: () => result };
}

function realRuntime(): GetEntityBboxRuntime {
  const pack = asPack(makePack());
  const biomes = asBiomes(makeBiomesData());
  return {
    collect: (type, ref) => collectEntityBbox(pack, biomes, type, ref),
  };
}

describe("get_entity_bbox — pure collector", () => {
  it("computes bbox for a state by numeric id", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "state",
      3,
    );
    // state 3 cells: 1,2,3,7 → p: (10,0),(20,0),(0,10),(10,20)
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      bbox: {
        x_min: 0,
        y_min: 0,
        x_max: 20,
        y_max: 20,
        width: 20,
        height: 20,
        cx: 10,
        cy: 10,
      },
      cells_count: 4,
    });
  });

  it("resolves by case-insensitive name", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "state",
      "altaria",
    );
    expect(result).toMatchObject({ i: 3, cells_count: 4 });
  });

  it("resolves by fullName", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "state",
      "Kingdom of Altaria",
    );
    expect(result).toMatchObject({ i: 3 });
  });

  it("computes bbox for a province", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "province",
      "Stormreach",
    );
    // province 4 cells: 1,2,4 → p: (10,0),(20,0),(10,10)
    expect(result).toMatchObject({
      i: 4,
      name: "Stormreach",
      bbox: {
        x_min: 10,
        y_min: 0,
        x_max: 20,
        y_max: 10,
        width: 10,
        height: 10,
        cx: 15,
        cy: 5,
      },
      cells_count: 3,
    });
  });

  it("computes bbox for a culture", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "culture",
      "Highlanders",
    );
    // culture 2 cells: 1,3,4,7 → p: (10,0),(0,10),(10,10),(10,20)
    expect(result).toMatchObject({
      i: 2,
      name: "Highlanders",
      bbox: {
        x_min: 0,
        y_min: 0,
        x_max: 10,
        y_max: 20,
        width: 10,
        height: 20,
        cx: 5,
        cy: 10,
      },
      cells_count: 4,
    });
  });

  it("computes bbox for a religion", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "religion",
      5,
    );
    // religion 5 cells: 1,2,4,7 → p: (10,0),(20,0),(10,10),(10,20)
    expect(result).toMatchObject({
      i: 5,
      name: "Stormcult",
      bbox: {
        x_min: 10,
        y_min: 0,
        x_max: 20,
        y_max: 20,
        width: 10,
        height: 20,
        cx: 15,
        cy: 10,
      },
      cells_count: 4,
    });
  });

  it("computes bbox for a biome", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "biome",
      2,
    );
    // biome 2 cells: 2,4,6 → p: (20,0),(10,10),(0,20)
    expect(result).toMatchObject({
      i: 2,
      name: "Forest",
      bbox: {
        x_min: 0,
        y_min: 0,
        x_max: 20,
        y_max: 20,
        width: 20,
        height: 20,
        cx: 10,
        cy: 10,
      },
      cells_count: 3,
    });
  });

  it("resolves biome by name (case-insensitive)", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "biome",
      "forest",
    );
    expect(result).toMatchObject({ i: 2, cells_count: 3 });
  });

  it("returns an empty bbox when no cell matches", () => {
    const pack = makePack();
    // Zero out every assignment for province 4 so it has no cells.
    for (let k = 0; k < pack.cells.province.length; k++) {
      if (pack.cells.province[k] === 4) pack.cells.province[k] = 0;
    }
    const result = collectEntityBbox(
      asPack(pack),
      asBiomes(makeBiomesData()),
      "province",
      4,
    );
    expect(result).toMatchObject({
      i: 4,
      name: "Stormreach",
      bbox: {
        x_min: null,
        y_min: null,
        x_max: null,
        y_max: null,
        width: null,
        height: null,
        cx: null,
        cy: null,
      },
      cells_count: 0,
    });
  });

  it("handles a single-cell entity (width/height = 0; cx/cy = the point)", () => {
    const pack = makePack();
    // Scrub state-3 everywhere except at cell 4 (which has p = (10,10)).
    for (let k = 0; k < pack.cells.state.length; k++) {
      if (pack.cells.state[k] === 3) pack.cells.state[k] = 0;
    }
    pack.cells.state[4] = 3;
    const result = collectEntityBbox(
      asPack(pack),
      asBiomes(makeBiomesData()),
      "state",
      3,
    );
    expect(result).toMatchObject({
      i: 3,
      bbox: {
        x_min: 10,
        y_min: 10,
        x_max: 10,
        y_max: 10,
        width: 0,
        height: 0,
        cx: 10,
        cy: 10,
      },
      cells_count: 1,
    });
  });

  it("skips cells whose p entry is missing or malformed", () => {
    const pack = makePack();
    // Replace state-3's cell 1 coord with undefined / a wrong-shape entry.
    (pack.cells.p as unknown as (typeof pack.cells.p | undefined)[])[1] =
      undefined;
    (pack.cells.p as unknown as unknown[])[2] = [42] as unknown;
    const result = collectEntityBbox(
      asPack(pack),
      asBiomes(makeBiomesData()),
      "state",
      3,
    );
    // Only cells 3 (0,10) and 7 (10,20) count toward state 3 now.
    expect(result).toMatchObject({
      i: 3,
      bbox: {
        x_min: 0,
        y_min: 10,
        x_max: 10,
        y_max: 20,
        width: 10,
        height: 10,
        cx: 5,
        cy: 15,
      },
      cells_count: 2,
    });
  });

  it("returns 'unknown-entity' for a removed state", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "state",
      1,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for id 0 placeholder (non-biome)", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "state",
      0,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for unknown name", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "culture",
      "Nonesuch",
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for the 'removed' biome sentinel", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "biome",
      4,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for unknown biome name", () => {
    const result = collectEntityBbox(
      asPack(makePack()),
      asBiomes(makeBiomesData()),
      "biome",
      "Nowhere",
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      collectEntityBbox(undefined, asBiomes(makeBiomesData()), "state", 3),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.i is missing", () => {
    const pack = { cells: { p: [] } } as unknown as Parameters<
      typeof collectEntityBbox
    >[0];
    expect(
      collectEntityBbox(pack, asBiomes(makeBiomesData()), "state", 3),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.p is missing", () => {
    const pack = { cells: { i: [0, 1, 2] } } as unknown as Parameters<
      typeof collectEntityBbox
    >[0];
    expect(
      collectEntityBbox(pack, asBiomes(makeBiomesData()), "state", 3),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when biomesData missing for biome domain", () => {
    expect(collectEntityBbox(asPack(makePack()), undefined, "biome", 2)).toBe(
      "not-ready",
    );
  });

  it("returns 0-cell bbox when the field is absent (but entity resolves)", () => {
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
    } as unknown as Parameters<typeof collectEntityBbox>[0];
    const result = collectEntityBbox(
      mutated,
      asBiomes(makeBiomesData()),
      "state",
      3,
    );
    expect(result).toMatchObject({ i: 3, cells_count: 0 });
  });
});

describe("get_entity_bbox — tool surface", () => {
  it("returns ok=true with the resolved entity and bbox", async () => {
    const tool = createGetEntityBboxTool(realRuntime());
    const result = await tool.execute({ entity_type: "state", entity: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      entity_type: "state",
      i: 3,
      name: "Altaria",
      bbox: {
        x_min: 0,
        y_min: 0,
        x_max: 20,
        y_max: 20,
        width: 20,
        height: 20,
        cx: 10,
        cy: 10,
      },
      cells_count: 4,
    });
  });

  it("accepts entity_type case-insensitively", async () => {
    const tool = createGetEntityBboxTool(realRuntime());
    for (const input of [
      { entity_type: "STATE", entity: 3 },
      { entity_type: "Province", entity: "Rookmark" },
      { entity_type: "Culture", entity: "Highlanders" },
      { entity_type: "ReLiGion", entity: 1 },
      { entity_type: "Biome", entity: 2 },
    ]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content).ok).toBe(true);
    }
  });

  it("rejects unknown entity_type", async () => {
    const tool = createGetEntityBboxTool(realRuntime());
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

  it("rejects missing / invalid entity (non-biome types)", async () => {
    const tool = createGetEntityBboxTool(realRuntime());
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

  it("accepts entity id 0 for biome but rejects negatives / fractions / empty", async () => {
    const tool = createGetEntityBboxTool(realRuntime());
    // Biome 0 (Marine) doesn't exist in the fake pack (no cells) but
    // still resolves the entity — returning an empty bbox with cells_count=0.
    const ok = await tool.execute({ entity_type: "biome", entity: 0 });
    expect(ok.isError).toBeFalsy();
    const body = JSON.parse(ok.content);
    expect(body.i).toBe(0);
    expect(body.name).toBe("Marine");

    for (const bad of [
      { entity_type: "biome", entity: -1 },
      { entity_type: "biome", entity: 1.5 },
      { entity_type: "biome", entity: "" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a non-negative integer id or a non-empty name string/,
      );
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetEntityBboxTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'unknown-entity' as a structured error", async () => {
    const tool = createGetEntityBboxTool(runtimeReturning("unknown-entity"));
    const r = await tool.execute({
      entity_type: "culture",
      entity: "Nowhere",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /Could not resolve culture "Nowhere"\./,
    );
  });

  it("is exported as getEntityBboxTool with the expected schema", () => {
    expect(getEntityBboxTool.name).toBe("get_entity_bbox");
    expect(getEntityBboxTool.input_schema.type).toBe("object");
    expect(getEntityBboxTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
    ]);
    expect(getEntityBboxTool.input_schema.properties.entity_type).toBeDefined();
    expect(getEntityBboxTool.input_schema.properties.entity).toBeDefined();
  });
});

// ----- defaultGetEntityBboxRuntime integration -----

describe("defaultGetEntityBboxRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    biomesData?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalBiomes = globalsRef.biomesData;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.biomesData = makeBiomesData() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.biomesData = originalBiomes;
  });

  it("reads real pack via the default runtime (state)", () => {
    const result = defaultGetEntityBboxRuntime.collect("state", 3);
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      bbox: { x_min: 0, y_min: 0, x_max: 20, y_max: 20 },
      cells_count: 4,
    });
  });

  it("reads real pack via the default runtime (culture)", () => {
    const result = defaultGetEntityBboxRuntime.collect(
      "culture",
      "Highlanders",
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Highlanders",
      bbox: { x_min: 0, y_min: 0, x_max: 10, y_max: 20 },
      cells_count: 4,
    });
  });

  it("reads real pack + biomesData via the default runtime (biome)", () => {
    const result = defaultGetEntityBboxRuntime.collect("biome", 2);
    expect(result).toMatchObject({
      i: 2,
      name: "Forest",
      bbox: { x_min: 0, y_min: 0, x_max: 20, y_max: 20 },
      cells_count: 3,
    });
  });

  it("tool uses default runtime to resolve against globalThis.pack", async () => {
    const result = await getEntityBboxTool.execute({
      entity_type: "religion",
      entity: "Stormcult",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "religion",
      i: 5,
      name: "Stormcult",
      cells_count: 4,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultGetEntityBboxRuntime.collect("state", 3)).toBe("not-ready");
    const result = await getEntityBboxTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
