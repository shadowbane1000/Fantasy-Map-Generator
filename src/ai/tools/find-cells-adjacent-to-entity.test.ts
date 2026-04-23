import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADJACENT_ENTITY_TYPES,
  type AdjacentEntityType,
  type CollectAdjacentCellsResult,
  collectAdjacentCellsForEntity,
  createFindCellsAdjacentToEntityTool,
  DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
  defaultFindCellsAdjacentToEntityRuntime,
  type FindCellsAdjacentToEntityRuntime,
  findCellsAdjacentToEntityTool,
  MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
} from "./find-cells-adjacent-to-entity";

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

// Hand-crafted 8-cell graph. Adjacency is a symmetric grid-like mesh:
//   0 - 1 - 3 - 5 - 7
//   |   |   |   |   |
//   2 - - - 4 - - - 6
// with cross-links so border rings are non-trivial.
//
// State 3 owns {1, 2, 3, 7} → border ring {0, 4, 5, 6}.
// State 5 owns {4, 5}       → border ring {2, 3, 6, 7}.
// Province "Rookmark" (i=2) owns {3, 5, 7} → border ring {1, 2, 4, 6}.
// Culture "Highlanders" (i=2) owns {1, 3, 4, 7} → border ring {0, 2, 5, 6}.
// Religion "Old Faith" (i=1) owns {3, 5, 6} → border ring {1, 2, 4, 7}.
// Biome 2 (Grassland) owns {3, 4, 5} → border ring {1, 2, 6, 7}.
function makePack(): FakePack {
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      c: [
        [1, 2],
        [0, 2, 3],
        [0, 1, 3, 4],
        [1, 2, 4, 5],
        [2, 3, 5, 6],
        [3, 4, 6, 7],
        [4, 5, 7],
        [5, 6],
      ],
      state: [0, 3, 3, 3, 5, 5, 0, 3],
      province: [0, 4, 4, 2, 4, 2, 0, 2],
      culture: [0, 2, 7, 2, 2, 7, 0, 2],
      religion: [0, 5, 5, 1, 5, 1, 1, 5],
      biome: [0, 0, 1, 2, 2, 2, 4, 5],
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
  // id 0 = Marine, 1 = Hot desert, 2 = Grassland, 3 = "removed" (retired),
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

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof collectAdjacentCellsForEntity>[0];
}

function asBiomesData(b: FakeBiomesData) {
  return b as unknown as Parameters<typeof collectAdjacentCellsForEntity>[1];
}

function runtimeReturning(
  result: CollectAdjacentCellsResult,
): FindCellsAdjacentToEntityRuntime {
  return { collect: () => result };
}

function realRuntime(): FindCellsAdjacentToEntityRuntime {
  const pack = asPack(makePack());
  const biomesData = asBiomesData(makeBiomesData());
  return {
    collect: (type, ref, limit) =>
      collectAdjacentCellsForEntity(pack, biomesData, type, ref, limit),
  };
}

describe("find_cells_adjacent_to_entity — pure collector", () => {
  it("collects the border ring for a state by numeric id", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      cells: [0, 4, 5, 6],
      count: 4,
    });
  });

  it("resolves a state by case-insensitive name", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      "altaria",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [0, 4, 5, 6] });
  });

  it("resolves a state by fullName", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      "Kingdom of Altaria",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [0, 4, 5, 6] });
  });

  it("collects the border ring for a province", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "province",
      "Rookmark",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Rookmark",
      cells: [1, 2, 4, 6],
      count: 4,
    });
  });

  it("collects the border ring for a culture", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "culture",
      "Highlanders",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Highlanders",
      cells: [0, 2, 5, 6],
      count: 4,
    });
  });

  it("collects the border ring for a religion", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "religion",
      1,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 1,
      name: "Old Faith",
      cells: [1, 2, 4, 7],
      count: 4,
    });
  });

  it("collects the border ring for a biome by numeric id", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "biome",
      2,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Grassland",
      cells: [1, 2, 6, 7],
      count: 4,
    });
  });

  it("resolves a biome by case-insensitive name and accepts id 0 (Marine)", () => {
    // Marine (id 0) owns cells {0, 1}. Cell 0 neighbors {1, 2} — {2}
    // outside. Cell 1 neighbors {0, 2, 3} — {2, 3} outside. Ring: {2, 3}.
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "biome",
      "marine",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 0,
      name: "Marine",
      cells: [2, 3],
      count: 2,
    });
  });

  it("deduplicates neighbors shared by multiple entity cells", () => {
    // Build a tiny graph where two entity cells share the same outside
    // neighbor.
    const pack = {
      cells: {
        i: [0, 1, 2, 3],
        c: [
          [1, 2], // 0 → 1 inside, 2 outside
          [0, 2, 3], // 1 → 0 inside, 2 outside, 3 outside
          [0, 1, 3],
          [1, 2],
        ],
        state: [3, 3, 5, 5],
        province: [],
        culture: [],
        religion: [],
        biome: [],
      },
      states: [
        { i: 0 } as FakeEntity,
        undefined as unknown as FakeEntity,
        undefined as unknown as FakeEntity,
        { i: 3, name: "X" },
        undefined as unknown as FakeEntity,
        { i: 5, name: "Y" },
      ],
      provinces: [],
      cultures: [],
      religions: [],
    };
    const result = collectAdjacentCellsForEntity(
      asPack(pack as unknown as FakePack),
      asBiomesData(makeBiomesData()),
      "state",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      cells: [2, 3], // 2 encountered from both cells 0 and 1 — deduped
      count: 2,
    });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      3,
      2,
    );
    expect(result).toMatchObject({
      i: 3,
      cells: [0, 4], // first two sorted ascending
      count: 4,
    });
  });

  it("returns empty border ring when the entity has no cells", () => {
    const pack = makePack();
    // Zero out state 3 assignments.
    for (let k = 0; k < pack.cells.state.length; k++) {
      if (pack.cells.state[k] === 3) pack.cells.state[k] = 0;
    }
    const result = collectAdjacentCellsForEntity(
      asPack(pack),
      asBiomesData(makeBiomesData()),
      "state",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [], count: 0 });
  });

  it("returns empty border ring when the entity owns every cell", () => {
    const pack = makePack();
    pack.cells.state = [3, 3, 3, 3, 3, 3, 3, 3];
    const result = collectAdjacentCellsForEntity(
      asPack(pack),
      asBiomesData(makeBiomesData()),
      "state",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [], count: 0 });
  });

  it("returns 'unknown-entity' for a removed state", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      1,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for an unresolvable name", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      "Nowhereland",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' when non-biome ref points at index-0 placeholder", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "state",
      0,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for the retired biome sentinel slot", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "biome",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for an unknown biome name", () => {
    const result = collectAdjacentCellsForEntity(
      asPack(makePack()),
      asBiomesData(makeBiomesData()),
      "biome",
      "Imaginary biome",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      collectAdjacentCellsForEntity(
        undefined,
        asBiomesData(makeBiomesData()),
        "state",
        3,
        DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.i is missing", () => {
    const pack = { cells: { c: [[]] } } as unknown as Parameters<
      typeof collectAdjacentCellsForEntity
    >[0];
    expect(
      collectAdjacentCellsForEntity(
        pack,
        asBiomesData(makeBiomesData()),
        "state",
        3,
        DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.c is missing", () => {
    const pack = { cells: { i: [0, 1, 2] } } as unknown as Parameters<
      typeof collectAdjacentCellsForEntity
    >[0];
    expect(
      collectAdjacentCellsForEntity(
        pack,
        asBiomesData(makeBiomesData()),
        "state",
        3,
        DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when biome requested without biomesData", () => {
    expect(
      collectAdjacentCellsForEntity(
        asPack(makePack()),
        undefined,
        "biome",
        2,
        DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns empty cells when the entity field is absent (but entity resolves)", () => {
    const pack = makePack();
    const mutated = {
      ...pack,
      cells: {
        i: pack.cells.i,
        c: pack.cells.c,
        // state field intentionally omitted
        province: pack.cells.province,
        culture: pack.cells.culture,
        religion: pack.cells.religion,
        biome: pack.cells.biome,
      },
    };
    const result = collectAdjacentCellsForEntity(
      mutated as unknown as Parameters<typeof collectAdjacentCellsForEntity>[0],
      asBiomesData(makeBiomesData()),
      "state",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [], count: 0 });
  });
});

describe("find_cells_adjacent_to_entity — tool surface", () => {
  it("returns ok=true with the resolved entity and border-ring cells", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
    const result = await tool.execute({ entity_type: "state", entity: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      entity_type: "state",
      i: 3,
      name: "Altaria",
      cells: [0, 4, 5, 6],
      count: 4,
    });
  });

  it("accepts entity_type case-insensitively", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
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

  it("accepts biome id 0 (Marine) — non-biome domains reject 0", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());

    const okRes = await tool.execute({ entity_type: "biome", entity: 0 });
    expect(okRes.isError).toBeFalsy();
    expect(JSON.parse(okRes.content)).toMatchObject({
      ok: true,
      entity_type: "biome",
      i: 0,
      name: "Marine",
    });

    const badRes = await tool.execute({ entity_type: "state", entity: 0 });
    expect(badRes.isError).toBe(true);
    expect(JSON.parse(badRes.content).error).toMatch(
      /entity must be a positive integer id or a non-empty name string/,
    );
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(2);
    expect(body.count).toBe(4);
  });

  it("rejects unknown entity_type", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
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

  it("rejects missing / invalid entity for non-biome domains", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
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

  it("rejects missing / invalid entity for biome domain", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
    for (const bad of [
      { entity_type: "biome" },
      { entity_type: "biome", entity: -1 },
      { entity_type: "biome", entity: 1.5 },
      { entity_type: "biome", entity: "" },
      { entity_type: "biome", entity: null },
      { entity_type: "biome", entity: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a non-negative integer id or a non-empty name string for the biome domain/,
      );
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsAdjacentToEntityTool(realRuntime());
    for (const bad of [
      { entity_type: "state", entity: 3, limit: 0 },
      { entity_type: "state", entity: 3, limit: -1 },
      { entity_type: "state", entity: 3, limit: 1.5 },
      { entity_type: "state", entity: 3, limit: "10" },
      {
        entity_type: "state",
        entity: 3,
        limit: MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT + 1,
      },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsAdjacentToEntityTool(
      runtimeReturning("not-ready"),
    );
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'unknown-entity' as a structured error", async () => {
    const tool = createFindCellsAdjacentToEntityTool(
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

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsAdjacentToEntityRuntime = {
      collect: (_t: AdjacentEntityType, _ref, limit) => {
        received = limit;
        return { i: 3, name: "Altaria", cells: [], count: 0 };
      },
    };
    const tool = createFindCellsAdjacentToEntityTool(runtime);
    await tool.execute({ entity_type: "state", entity: 3 });
    expect(received).toBe(DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT);
  });

  it("is exported as findCellsAdjacentToEntityTool with the expected schema", () => {
    expect(findCellsAdjacentToEntityTool.name).toBe(
      "find_cells_adjacent_to_entity",
    );
    expect(findCellsAdjacentToEntityTool.input_schema.type).toBe("object");
    expect(findCellsAdjacentToEntityTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
    ]);
    expect(
      findCellsAdjacentToEntityTool.input_schema.properties.entity_type,
    ).toBeDefined();
    expect(
      findCellsAdjacentToEntityTool.input_schema.properties.entity,
    ).toBeDefined();
    expect(
      findCellsAdjacentToEntityTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants and ADJACENT_ENTITY_TYPES", () => {
    expect(DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT).toBe(100000);
    expect(ADJACENT_ENTITY_TYPES).toEqual([
      "state",
      "province",
      "culture",
      "religion",
      "biome",
    ]);
  });
});

// ----- defaultFindCellsAdjacentToEntityRuntime integration -----

describe("defaultFindCellsAdjacentToEntityRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    biomesData?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalBiomesData = globalsRef.biomesData;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.biomesData = makeBiomesData() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.biomesData = originalBiomesData;
  });

  it("reads real pack via the default runtime for a state (happy path)", () => {
    const result = defaultFindCellsAdjacentToEntityRuntime.collect(
      "state",
      3,
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      cells: [0, 4, 5, 6],
      count: 4,
    });
  });

  it("reads real pack + biomesData via the default runtime for a biome", () => {
    const result = defaultFindCellsAdjacentToEntityRuntime.collect(
      "biome",
      "Grassland",
      DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
    );
    expect(result).toMatchObject({
      i: 2,
      name: "Grassland",
      cells: [1, 2, 6, 7],
      count: 4,
    });
  });

  it("tool uses default runtime to resolve against globalThis.pack", async () => {
    const result = await findCellsAdjacentToEntityTool.execute({
      entity_type: "religion",
      entity: "Old Faith",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "religion",
      i: 1,
      cells: [1, 2, 4, 7],
      count: 4,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsAdjacentToEntityRuntime.collect(
        "state",
        3,
        DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsAdjacentToEntityTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when biomesData is missing for a biome query", async () => {
    globalsRef.biomesData = undefined;
    expect(
      defaultFindCellsAdjacentToEntityRuntime.collect(
        "biome",
        2,
        DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsAdjacentToEntityTool.execute({
      entity_type: "biome",
      entity: 2,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
