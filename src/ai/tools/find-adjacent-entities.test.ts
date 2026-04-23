import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADJACENT_ENTITY_TYPES,
  type AdjacentEntityType,
  createFindAdjacentEntitiesTool,
  DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
  defaultFindAdjacentEntitiesRuntime,
  type FindAdjacentEntitiesResult,
  type FindAdjacentEntitiesRuntime,
  findAdjacentEntitiesInPack,
  findAdjacentEntitiesTool,
  MAX_FIND_ADJACENT_ENTITIES_LIMIT,
} from "./find-adjacent-entities";

interface FakeEntity {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
}

interface FakePack {
  cells: {
    i: number[];
    c: number[][];
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

// 8 cells laid out in a simple graph:
//
//   0 - 1 - 2
//   |   |   |
//   3 - 4 - 5
//       |
//   6 - 7
//
// Neighbors per cell:
const FAKE_NEIGHBORS: number[][] = [
  /* 0 */ [1, 3],
  /* 1 */ [0, 2, 4],
  /* 2 */ [1, 5],
  /* 3 */ [0, 4],
  /* 4 */ [1, 3, 5, 7],
  /* 5 */ [2, 4],
  /* 6 */ [7],
  /* 7 */ [4, 6],
];

function makePack(): FakePack {
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      c: FAKE_NEIGHBORS.map((n) => n.slice()),
      // state:   3 touches 5 (via 2-5 / 1-2 etc.), and both touch 0 (Neutrals)
      //   cell:   0 1 2 3 4 5 6 7
      //   state:  0 3 3 3 5 5 0 3
      state: [0, 3, 3, 3, 5, 5, 0, 3],
      // province layout — 2, 4 (neighbors of each other and of 0-placeholder)
      //   cell:      0 1 2 3 4 5 6 7
      //   province:  0 4 4 2 4 2 0 2
      province: [0, 4, 4, 2, 4, 2, 0, 2],
      // culture — 2, 7 (neighbors of each other and of 0)
      //   cell:     0 1 2 3 4 5 6 7
      //   culture:  0 2 7 2 2 7 0 2
      culture: [0, 2, 7, 2, 2, 7, 0, 2],
      // religion — 1, 5 (neighbors of each other and of 0)
      //   cell:      0 1 2 3 4 5 6 7
      //   religion:  0 5 5 1 5 1 1 5
      religion: [0, 5, 5, 1, 5, 1, 1, 5],
      // biome — 1 borders 2, 3 (Marine); 2 borders 1 only
      //   cell:   0 1 2 3 4 5 6 7
      //   biome:  1 1 2 3 2 3 2 1
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
  return p as unknown as Parameters<typeof findAdjacentEntitiesInPack>[1];
}

function asBiomes(b: FakeBiomesData) {
  return b as unknown as Parameters<typeof findAdjacentEntitiesInPack>[0];
}

function runtimeReturning(
  result: FindAdjacentEntitiesResult,
): FindAdjacentEntitiesRuntime {
  return { collect: () => result };
}

function realRuntime(): FindAdjacentEntitiesRuntime {
  const pack = asPack(makePack());
  const biomes = asBiomes(makeBiomesData());
  return {
    collect: (type, ref, includeNeutrals, limit) =>
      findAdjacentEntitiesInPack(
        biomes,
        pack,
        type,
        ref,
        includeNeutrals,
        limit,
      ),
  };
}

describe("find_adjacent_entities — pure collector", () => {
  it("returns adjacent states by numeric id (excludes neutrals by default)", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "state",
      3,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    // State 3 (cells 1,2,3,7) touches state 5 (cell 4 via 1-4, 4 via 7-4, 4 via 2-5... etc).
    // Neutrals (0) also touches (cell 0 neighbor of cell 1 / cell 3) but excluded by default.
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      adjacent: [{ i: 5, name: "Brumaria" }],
      count: 1,
    });
  });

  it("resolves source by case-insensitive name", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "state",
      "altaria",
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, adjacent: [{ i: 5 }], count: 1 });
  });

  it("resolves source by fullName", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "state",
      "Kingdom of Altaria",
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({ i: 3 });
  });

  it("include_neutrals=true includes id 0", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "state",
      3,
      true,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      adjacent: [
        { i: 0, name: "Neutrals" },
        { i: 5, name: "Brumaria" },
      ],
      count: 2,
    });
  });

  it("finds adjacent provinces", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "province",
      "Rookmark",
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    // Province 2 (cells 3,5,7) touches province 4 (cells 1,2,4) through 3-4, 5-4, 7-4.
    expect(result).toMatchObject({
      i: 2,
      name: "Rookmark",
      adjacent: [{ i: 4, name: "Stormreach" }],
      count: 1,
    });
  });

  it("finds adjacent cultures", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "culture",
      "Highlanders",
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    // Culture 2 (cells 1,3,4,7) touches culture 7 (cells 2,5).
    // Cell 0 (culture 0) is a neighbor but excluded.
    // Cell 6 (culture 0) is a neighbor of 7 but excluded.
    expect(result).toMatchObject({
      i: 2,
      adjacent: [{ i: 7, name: "Marshfolk" }],
      count: 1,
    });
  });

  it("finds adjacent religions", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "religion",
      5,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    // Religion 5 (cells 1,2,4,7) touches religion 1 (cells 3,5,6).
    expect(result).toMatchObject({
      i: 5,
      name: "Stormcult",
      adjacent: [{ i: 1, name: "Old Faith" }],
      count: 1,
    });
  });

  it("finds adjacent biomes (0 = Marine included, neutrals flag is a no-op)", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "biome",
      2,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    // Biome 2 (cells 2, 4, 6): neighbors hit 1 (cells 1,7), 3 (cells 3,5), 7 (6→7 cell 7 is biome 1).
    // Actual neighbor hits for cell 2 -> 1,5 (biome 1, biome 3); cell 4 -> 1,3,5,7 -> biomes 1,3,3,1; cell 6 -> 7 (biome 1).
    // So adjacent biomes = {1, 3}.
    expect(result).toMatchObject({
      i: 2,
      name: "Forest",
      adjacent: [
        { i: 1, name: "Grassland" },
        { i: 3, name: "Desert" },
      ],
      count: 2,
    });
  });

  it("resolves biome by name (case-insensitive)", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "biome",
      "forest",
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({ i: 2, count: 2 });
  });

  it("truncates `adjacent` at limit but preserves full `count`", () => {
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(makePack()),
      "biome",
      2,
      false,
      1,
    );
    expect(result).toMatchObject({ i: 2, count: 2 });
    if (typeof result === "object") {
      expect(result.adjacent).toHaveLength(1);
    }
  });

  it("returns 'unknown-entity' for removed state", () => {
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        asPack(makePack()),
        "state",
        1,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for id 0 placeholder (non-biome)", () => {
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        asPack(makePack()),
        "state",
        0,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for unknown name", () => {
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        asPack(makePack()),
        "culture",
        "Nonesuch",
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' when biome name is the 'removed' sentinel", () => {
    // biome at index 4 has name "removed" — findBiomeByRef skips it.
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        asPack(makePack()),
        "biome",
        4,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("unknown-entity");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        undefined,
        "state",
        3,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when cells.c is missing", () => {
    const pack = makePack();
    const mutated = {
      ...pack,
      cells: {
        i: pack.cells.i,
        state: pack.cells.state,
        province: pack.cells.province,
        culture: pack.cells.culture,
        religion: pack.cells.religion,
        biome: pack.cells.biome,
      },
    } as unknown as Parameters<typeof findAdjacentEntitiesInPack>[1];
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        mutated,
        "state",
        3,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when the field is absent", () => {
    const pack = makePack();
    const mutated = {
      ...pack,
      cells: {
        i: pack.cells.i,
        c: pack.cells.c,
        // state field omitted
        province: pack.cells.province,
        culture: pack.cells.culture,
        religion: pack.cells.religion,
        biome: pack.cells.biome,
      },
    } as unknown as Parameters<typeof findAdjacentEntitiesInPack>[1];
    expect(
      findAdjacentEntitiesInPack(
        asBiomes(makeBiomesData()),
        mutated,
        "state",
        3,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("silently drops adjacent ids that do not resolve to a live entity", () => {
    // Stub in a state id (7) at cell 4 which is a neighbor of state-3 cells
    // but that state has no collection entry.
    const pack = makePack();
    pack.cells.state = [0, 3, 3, 3, 7, 5, 0, 3];
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(pack),
      "state",
      3,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    // 7 should drop out, 5 survives.
    expect(result).toMatchObject({
      i: 3,
      adjacent: [{ i: 5, name: "Brumaria" }],
      count: 1,
    });
  });

  it("sorts adjacent entities by id ascending (deterministic)", () => {
    // Three-way province layout on a small chain:
    //   cells:     0 1 2 3 4 5 6 7
    //   province:  2 4 2 4 2 2 4 4  (invented)
    // We want province 2 adjacent to include multiple neighbors.
    // Here we'll cheat and add id 10 to the collection + cells to test sort.
    const pack = makePack();
    pack.cells.province = [10, 4, 10, 4, 2, 2, 4, 2];
    pack.provinces[10] = { i: 10, name: "Westmark" };
    const result = findAdjacentEntitiesInPack(
      asBiomes(makeBiomesData()),
      asPack(pack),
      "province",
      2,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    if (typeof result === "object") {
      const ids = result.adjacent.map((r) => r.i);
      // must be ascending
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      // and include both 4 and 10
      expect(ids).toContain(4);
      expect(ids).toContain(10);
    }
  });
});

describe("find_adjacent_entities — tool surface", () => {
  it("returns ok=true with the resolved entity and adjacent list", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    const result = await tool.execute({ entity_type: "state", entity: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      entity_type: "state",
      i: 3,
      name: "Altaria",
      adjacent: [{ i: 5, name: "Brumaria" }],
      count: 1,
    });
  });

  it("accepts entity_type case-insensitively", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    for (const input of [
      { entity_type: "STATE", entity: 3 },
      { entity_type: "Province", entity: "Rookmark" },
      { entity_type: "ReLiGion", entity: 1 },
      { entity_type: "Biome", entity: 2 },
    ]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content).ok).toBe(true);
    }
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    const result = await tool.execute({
      entity_type: "biome",
      entity: 2,
      limit: 1,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.adjacent).toHaveLength(1);
    expect(body.count).toBe(2);
  });

  it("passes include_neutrals through to the runtime", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      include_neutrals: true,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(2);
    expect(body.adjacent.map((a: { i: number }) => a.i)).toEqual([0, 5]);
  });

  it("rejects unknown entity_type", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
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
    const tool = createFindAdjacentEntitiesTool(realRuntime());
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

  it("accepts entity id 0 for biome but rejects negatives / fractions", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    // 0 should resolve (Marine) — not an error.
    const ok = await tool.execute({ entity_type: "biome", entity: 0 });
    expect(ok.isError).toBeFalsy();

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

  it("rejects non-boolean include_neutrals", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    for (const bad of [
      { entity_type: "state", entity: 3, include_neutrals: "yes" },
      { entity_type: "state", entity: 3, include_neutrals: 1 },
      { entity_type: "state", entity: 3, include_neutrals: {} },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /include_neutrals must be a boolean/,
      );
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindAdjacentEntitiesTool(realRuntime());
    for (const bad of [
      { entity_type: "state", entity: 3, limit: 0 },
      { entity_type: "state", entity: 3, limit: -1 },
      { entity_type: "state", entity: 3, limit: 1.5 },
      { entity_type: "state", entity: 3, limit: "10" },
      {
        entity_type: "state",
        entity: 3,
        limit: MAX_FIND_ADJACENT_ENTITIES_LIMIT + 1,
      },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindAdjacentEntitiesTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'unknown-entity' as a structured error", async () => {
    const tool = createFindAdjacentEntitiesTool(
      runtimeReturning("unknown-entity"),
    );
    const r = await tool.execute({
      entity_type: "culture",
      entity: "Nowhere",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /Could not resolve culture "Nowhere"\./,
    );
  });

  it("applies default limit and include_neutrals when omitted", async () => {
    let receivedLimit = -1;
    let receivedNeutrals: unknown = "unset";
    const runtime: FindAdjacentEntitiesRuntime = {
      collect: (_t: AdjacentEntityType, _ref, includeNeutrals, limit) => {
        receivedLimit = limit;
        receivedNeutrals = includeNeutrals;
        return { i: 3, name: "Altaria", adjacent: [], count: 0 };
      },
    };
    const tool = createFindAdjacentEntitiesTool(runtime);
    await tool.execute({ entity_type: "state", entity: 3 });
    expect(receivedLimit).toBe(DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT);
    expect(receivedNeutrals).toBe(false);
  });

  it("is exported as findAdjacentEntitiesTool with the expected schema", () => {
    expect(findAdjacentEntitiesTool.name).toBe("find_adjacent_entities");
    expect(findAdjacentEntitiesTool.input_schema.type).toBe("object");
    expect(findAdjacentEntitiesTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
    ]);
    expect(
      findAdjacentEntitiesTool.input_schema.properties.entity_type,
    ).toBeDefined();
    expect(
      findAdjacentEntitiesTool.input_schema.properties.entity,
    ).toBeDefined();
    expect(
      findAdjacentEntitiesTool.input_schema.properties.include_neutrals,
    ).toBeDefined();
    expect(
      findAdjacentEntitiesTool.input_schema.properties.limit,
    ).toBeDefined();
    expect(ADJACENT_ENTITY_TYPES).toEqual([
      "state",
      "province",
      "culture",
      "religion",
      "biome",
    ]);
  });
});

// ----- defaultFindAdjacentEntitiesRuntime integration -----

describe("defaultFindAdjacentEntitiesRuntime (integration)", () => {
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
    const result = defaultFindAdjacentEntitiesRuntime.collect(
      "state",
      3,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      adjacent: [{ i: 5, name: "Brumaria" }],
      count: 1,
    });
  });

  it("reads real pack via the default runtime (province)", () => {
    const result = defaultFindAdjacentEntitiesRuntime.collect(
      "province",
      2,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Rookmark",
      adjacent: [{ i: 4, name: "Stormreach" }],
      count: 1,
    });
  });

  it("reads real pack via the default runtime (culture)", () => {
    const result = defaultFindAdjacentEntitiesRuntime.collect(
      "culture",
      2,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      adjacent: [{ i: 7, name: "Marshfolk" }],
      count: 1,
    });
  });

  it("reads real pack via the default runtime (religion)", () => {
    const result = defaultFindAdjacentEntitiesRuntime.collect(
      "religion",
      5,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({
      i: 5,
      name: "Stormcult",
      adjacent: [{ i: 1, name: "Old Faith" }],
      count: 1,
    });
  });

  it("reads real pack + biomesData via the default runtime (biome)", () => {
    const result = defaultFindAdjacentEntitiesRuntime.collect(
      "biome",
      2,
      false,
      DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Forest",
      adjacent: [
        { i: 1, name: "Grassland" },
        { i: 3, name: "Desert" },
      ],
      count: 2,
    });
  });

  it("tool uses default runtime to resolve against globalThis.pack", async () => {
    const result = await findAdjacentEntitiesTool.execute({
      entity_type: "state",
      entity: "Altaria",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "state",
      i: 3,
      adjacent: [{ i: 5, name: "Brumaria" }],
      count: 1,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindAdjacentEntitiesRuntime.collect(
        "state",
        3,
        false,
        DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findAdjacentEntitiesTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
