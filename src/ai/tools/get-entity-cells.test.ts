import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CollectEntityCellsResult,
  collectCellsForEntity,
  createGetEntityCellsTool,
  DEFAULT_GET_ENTITY_CELLS_LIMIT,
  defaultGetEntityCellsRuntime,
  type EntityType,
  type GetEntityCellsRuntime,
  getEntityCellsTool,
  MAX_GET_ENTITY_CELLS_LIMIT,
} from "./get-entity-cells";

interface FakeEntity {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
}

interface FakePack {
  cells: {
    i: number[];
    state: number[];
    province: number[];
    culture: number[];
    religion: number[];
  };
  states: FakeEntity[];
  provinces: FakeEntity[];
  cultures: FakeEntity[];
  religions: FakeEntity[];
}

function makePack(): FakePack {
  // 8 cells. Distribute each field across a few ids so we can count.
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      state: [0, 3, 3, 3, 5, 5, 0, 3],
      province: [0, 4, 4, 2, 4, 2, 0, 2],
      culture: [0, 2, 7, 2, 2, 7, 0, 2],
      religion: [0, 5, 5, 1, 5, 1, 1, 5],
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

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof collectCellsForEntity>[0];
}

function runtimeReturning(
  result: CollectEntityCellsResult,
): GetEntityCellsRuntime {
  return { collect: () => result };
}

function realRuntime(): GetEntityCellsRuntime {
  const pack = asPack(makePack());
  return {
    collect: (type, ref, limit) =>
      collectCellsForEntity(pack, type, ref, limit),
  };
}

describe("get_entity_cells — pure collector", () => {
  it("collects every cell for a state by numeric id", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "state",
      3,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      cells: [1, 2, 3, 7],
      count: 4,
    });
  });

  it("resolves a state by case-insensitive name", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "state",
      "altaria",
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [1, 2, 3, 7] });
  });

  it("resolves a state by fullName", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "state",
      "Kingdom of Altaria",
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({ i: 3 });
  });

  it("collects cells for a province", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "province",
      "Rookmark",
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({ i: 2, cells: [3, 5, 7], count: 3 });
  });

  it("collects cells for a culture", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "culture",
      "Highlanders",
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({ i: 2, cells: [1, 3, 4, 7], count: 4 });
  });

  it("collects cells for a religion", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "religion",
      5,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({
      i: 5,
      name: "Stormcult",
      cells: [1, 2, 4, 7],
      count: 4,
    });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = collectCellsForEntity(asPack(makePack()), "state", 3, 2);
    expect(result).toMatchObject({
      i: 3,
      cells: [1, 2], // iteration order, first two hits
      count: 4,
    });
  });

  it("returns empty cells and count=0 when no cell points at the entity", () => {
    const pack = makePack();
    // Province 4 exists, but zero out its assignments.
    for (let k = 0; k < pack.cells.province.length; k++) {
      if (pack.cells.province[k] === 4) pack.cells.province[k] = 0;
    }
    const result = collectCellsForEntity(
      asPack(pack),
      "province",
      4,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({ i: 4, cells: [], count: 0 });
  });

  it("returns 'unknown-entity' for a removed state", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "state",
      1,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' for an unresolvable name", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "state",
      "Nowhereland",
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'unknown-entity' when ref points at index 0 placeholder", () => {
    const result = collectCellsForEntity(
      asPack(makePack()),
      "state",
      0,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toBe("unknown-entity");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      collectCellsForEntity(
        undefined,
        "state",
        1,
        DEFAULT_GET_ENTITY_CELLS_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.i is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof collectCellsForEntity
    >[0];
    expect(
      collectCellsForEntity(pack, "state", 1, DEFAULT_GET_ENTITY_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 0 cells when the cells field is absent (but entity resolves)", () => {
    const pack = makePack();
    // Drop the state field to simulate a partial pack.
    const mutated = {
      ...pack,
      cells: {
        i: pack.cells.i,
        // state field intentionally omitted
        province: pack.cells.province,
        culture: pack.cells.culture,
        religion: pack.cells.religion,
      },
    };
    const result = collectCellsForEntity(
      mutated as unknown as Parameters<typeof collectCellsForEntity>[0],
      "state",
      3,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({ i: 3, cells: [], count: 0 });
  });
});

describe("get_entity_cells — tool surface", () => {
  it("returns ok=true with the resolved entity and cells", async () => {
    const tool = createGetEntityCellsTool(realRuntime());
    const result = await tool.execute({ entity_type: "state", entity: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      entity_type: "state",
      i: 3,
      name: "Altaria",
      cells: [1, 2, 3, 7],
      count: 4,
    });
  });

  it("accepts entity_type case-insensitively (STATE, Province, ReLiGion)", async () => {
    const tool = createGetEntityCellsTool(realRuntime());
    for (const input of [
      { entity_type: "STATE", entity: 3 },
      { entity_type: "Province", entity: "Rookmark" },
      { entity_type: "ReLiGion", entity: 1 },
    ]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content).ok).toBe(true);
    }
  });

  it("respects limit and still reports full count", async () => {
    const tool = createGetEntityCellsTool(realRuntime());
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
    const tool = createGetEntityCellsTool(realRuntime());
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

  it("rejects missing / invalid entity", async () => {
    const tool = createGetEntityCellsTool(realRuntime());
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

  it("rejects invalid limit", async () => {
    const tool = createGetEntityCellsTool(realRuntime());
    for (const bad of [
      { entity_type: "state", entity: 3, limit: 0 },
      { entity_type: "state", entity: 3, limit: -1 },
      { entity_type: "state", entity: 3, limit: 1.5 },
      { entity_type: "state", entity: 3, limit: "10" },
      {
        entity_type: "state",
        entity: 3,
        limit: MAX_GET_ENTITY_CELLS_LIMIT + 1,
      },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetEntityCellsTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'unknown-entity' as a structured error", async () => {
    const tool = createGetEntityCellsTool(runtimeReturning("unknown-entity"));
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
    const runtime: GetEntityCellsRuntime = {
      collect: (_t: EntityType, _ref, limit) => {
        received = limit;
        return { i: 3, name: "Altaria", cells: [], count: 0 };
      },
    };
    const tool = createGetEntityCellsTool(runtime);
    await tool.execute({ entity_type: "state", entity: 3 });
    expect(received).toBe(DEFAULT_GET_ENTITY_CELLS_LIMIT);
  });

  it("is exported as getEntityCellsTool with the expected schema", () => {
    expect(getEntityCellsTool.name).toBe("get_entity_cells");
    expect(getEntityCellsTool.input_schema.type).toBe("object");
    expect(getEntityCellsTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
    ]);
    expect(
      getEntityCellsTool.input_schema.properties.entity_type,
    ).toBeDefined();
    expect(getEntityCellsTool.input_schema.properties.entity).toBeDefined();
    expect(getEntityCellsTool.input_schema.properties.limit).toBeDefined();
  });
});

// ----- defaultGetEntityCellsRuntime integration -----

describe("defaultGetEntityCellsRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultGetEntityCellsRuntime.collect(
      "state",
      3,
      DEFAULT_GET_ENTITY_CELLS_LIMIT,
    );
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      cells: [1, 2, 3, 7],
      count: 4,
    });
  });

  it("tool uses default runtime to resolve against globalThis.pack", async () => {
    const result = await getEntityCellsTool.execute({
      entity_type: "religion",
      entity: "Stormcult",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "religion",
      i: 5,
      cells: [1, 2, 4, 7],
      count: 4,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultGetEntityCellsRuntime.collect(
        "state",
        3,
        DEFAULT_GET_ENTITY_CELLS_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await getEntityCellsTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
