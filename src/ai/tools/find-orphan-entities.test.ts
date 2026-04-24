import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindOrphanEntitiesTool,
  defaultFindOrphanEntitiesRuntime,
  type FindOrphanEntitiesPackLike,
  type FindOrphanEntitiesResult,
  type FindOrphanEntitiesRuntime,
  findOrphanEntitiesInPack,
  findOrphanEntitiesTool,
  type OrphanEntity,
} from "./find-orphan-entities";

interface FakeState {
  i: number;
  name?: string;
  capital?: number;
  removed?: boolean;
}

interface FakeProvince {
  i: number;
  name?: string;
  state?: number;
  burg?: number;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
  state?: number;
  culture?: number;
  removed?: boolean;
}

interface FakeReligion {
  i: number;
  name?: string;
  culture?: number;
  removed?: boolean;
}

interface FakeCulture {
  i: number;
  name?: string;
  removed?: boolean;
}

interface FakePack {
  states: Array<FakeState | undefined>;
  provinces: Array<FakeProvince | undefined>;
  burgs: Array<FakeBurg | undefined>;
  religions: Array<FakeReligion | undefined>;
  cultures: Array<FakeCulture | undefined>;
}

function makeCleanPack(): FakePack {
  return {
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Altaria", capital: 1 },
      { i: 2, name: "Borland", capital: 2 },
    ],
    provinces: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "Rookmark", state: 1, burg: 1 },
      { i: 2, name: "Ashgard", state: 2 },
    ],
    burgs: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "Ironhold", state: 1, culture: 1 },
      { i: 2, name: "Stormport", state: 2, culture: 0 },
    ],
    religions: [
      { i: 0, name: "No religion" },
      { i: 1, name: "Stormcult", culture: 1 },
      { i: 2, name: "Old Ways", culture: 0 },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Highlanders" },
    ],
  };
}

function asPack(p: FakePack): FindOrphanEntitiesPackLike {
  return p as unknown as FindOrphanEntitiesPackLike;
}

function runtimeReturning(
  result: FindOrphanEntitiesResult,
): FindOrphanEntitiesRuntime {
  return { scan: () => result };
}

describe("find_orphan_entities — pure collector", () => {
  it("returns empty orphans for a clean pack", () => {
    const result = findOrphanEntitiesInPack(asPack(makeCleanPack()));
    expect(result).toEqual({ orphans: [], count: 0 });
  });

  it("flags state.capital pointing at an out-of-range burg id", () => {
    const pack = makeCleanPack();
    const s = pack.states[1];
    if (s) s.capital = 99;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    expect(result.count).toBe(1);
    expect(result.orphans[0]).toEqual({
      entity_type: "state",
      i: 1,
      name: "Altaria",
      issue: "state.capital=99 does not reference an active burg",
    });
  });

  it("flags state.capital pointing at a removed burg", () => {
    const pack = makeCleanPack();
    const b = pack.burgs[1];
    if (b) b.removed = true;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    // Altaria's capital 1 is removed → state orphan
    // Also Rookmark.burg=1 (removed) → province orphan
    const stateOrphans = result.orphans.filter(
      (o) => o.entity_type === "state",
    );
    expect(stateOrphans).toHaveLength(1);
    expect(stateOrphans[0]?.issue).toMatch(
      /state\.capital=1 does not reference an active burg/,
    );
  });

  it("does NOT flag state.capital === 0 (no capital marker)", () => {
    const pack = makeCleanPack();
    const s = pack.states[1];
    if (s) s.capital = 0;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    expect(result.count).toBe(0);
  });

  it("flags province.state === 0 (assigned to Neutrals)", () => {
    const pack = makeCleanPack();
    const p = pack.provinces[1];
    if (p) p.state = 0;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const hit = result.orphans.find(
      (o) => o.entity_type === "province" && o.i === 1,
    );
    expect(hit?.issue).toMatch(/province\.state=0/);
  });

  it("flags province.state pointing at a removed state", () => {
    const pack = makeCleanPack();
    const s = pack.states[2];
    if (s) s.removed = true;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    // Borland removed → Ashgard.state=2 is orphan, and Stormport.state=2 too
    const provinceHits = result.orphans.filter(
      (o) => o.entity_type === "province",
    );
    expect(provinceHits).toHaveLength(1);
    expect(provinceHits[0]?.i).toBe(2);
    expect(provinceHits[0]?.issue).toMatch(
      /province\.state=2 does not reference an active state/,
    );
  });

  it("flags province.state pointing at an out-of-range id", () => {
    const pack = makeCleanPack();
    const p = pack.provinces[1];
    if (p) p.state = 99;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const hit = result.orphans.find(
      (o) => o.entity_type === "province" && o.i === 1,
    );
    expect(hit?.issue).toMatch(/province\.state=99/);
  });

  it("flags province.burg pointing at a removed burg", () => {
    const pack = makeCleanPack();
    // point Ashgard at burg 1 (active) then remove burg 1
    const p = pack.provinces[2];
    if (p) p.burg = 1;
    const b = pack.burgs[1];
    if (b) b.removed = true;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const provHits = result.orphans.filter(
      (o) => o.entity_type === "province" && o.i === 2,
    );
    expect(provHits).toHaveLength(1);
    expect(provHits[0]?.issue).toMatch(/province\.burg=1/);
  });

  it("does NOT flag province.burg === 0 or missing", () => {
    const pack = makeCleanPack();
    const p = pack.provinces[2];
    if (p) p.burg = 0;
    // Ashgard has no capital — that's fine
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const provHits = result.orphans.filter(
      (o) => o.entity_type === "province" && o.i === 2,
    );
    expect(provHits).toHaveLength(0);
  });

  it("does NOT flag burg.state === 0 (Neutrals is valid for burgs)", () => {
    const pack = makeCleanPack();
    const b = pack.burgs[1];
    if (b) b.state = 0;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const burgHits = result.orphans.filter(
      (o) => o.entity_type === "burg" && o.i === 1,
    );
    expect(burgHits).toHaveLength(0);
  });

  it("flags burg.state pointing at a removed state", () => {
    const pack = makeCleanPack();
    const s = pack.states[1];
    if (s) s.removed = true;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const burgHits = result.orphans.filter(
      (o) => o.entity_type === "burg" && o.i === 1,
    );
    expect(burgHits).toHaveLength(1);
    expect(burgHits[0]?.issue).toMatch(/burg\.state=1/);
  });

  it("flags burg.culture pointing at an out-of-range id", () => {
    const pack = makeCleanPack();
    const b = pack.burgs[1];
    if (b) b.culture = 99;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const hit = result.orphans.find(
      (o) => o.entity_type === "burg" && o.i === 1,
    );
    expect(hit?.issue).toMatch(/burg\.culture=99/);
  });

  it("does NOT flag burg.culture === 0 (Wildlands is valid)", () => {
    const pack = makeCleanPack();
    // burg 2 already has culture=0
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const burgHits = result.orphans.filter(
      (o) => o.entity_type === "burg" && o.i === 2,
    );
    expect(burgHits).toHaveLength(0);
  });

  it("does NOT flag religion.culture when missing / undefined", () => {
    const pack = makeCleanPack();
    const r = pack.religions[1];
    if (r) r.culture = undefined;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const relHits = result.orphans.filter((o) => o.entity_type === "religion");
    expect(relHits).toHaveLength(0);
  });

  it("flags religion.culture pointing at an out-of-range id", () => {
    const pack = makeCleanPack();
    const r = pack.religions[1];
    if (r) r.culture = 99;
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const hit = result.orphans.find(
      (o) => o.entity_type === "religion" && o.i === 1,
    );
    expect(hit?.issue).toMatch(/religion\.culture=99/);
  });

  it("skips entities that are themselves removed or placeholders", () => {
    const pack = makeCleanPack();
    // Break state 2 but mark it removed — should not flag its capital
    const s = pack.states[2];
    if (s) {
      s.capital = 99;
      s.removed = true;
    }
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    // But Ashgard still refs removed state 2 → that IS flagged
    const stateHits = result.orphans.filter((o) => o.entity_type === "state");
    expect(stateHits).toHaveLength(0);
    const provinceHits = result.orphans.filter(
      (o) => o.entity_type === "province",
    );
    expect(provinceHits).toHaveLength(1);
    expect(provinceHits[0]?.i).toBe(2);
  });

  it("produces deterministic sort order (entity_type then i)", () => {
    const pack = makeCleanPack();
    // Seed multiple orphans across types
    if (pack.states[1]) pack.states[1].capital = 99; // state:1
    if (pack.states[2]) pack.states[2].capital = 98; // state:2
    if (pack.provinces[1]) pack.provinces[1].state = 99; // province:1
    if (pack.burgs[2]) pack.burgs[2].culture = 99; // burg:2
    if (pack.religions[1]) pack.religions[1].culture = 99; // religion:1
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    const ids = result.orphans.map((o) => `${o.entity_type}:${o.i}`);
    expect(ids).toEqual([
      "burg:2",
      "province:1",
      "religion:1",
      "state:1",
      "state:2",
    ]);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findOrphanEntitiesInPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when any required collection is missing", () => {
    const pack = makeCleanPack();
    expect(
      findOrphanEntitiesInPack({
        ...asPack(pack),
        states: undefined,
      } as FindOrphanEntitiesPackLike),
    ).toBe("not-ready");
    expect(
      findOrphanEntitiesInPack({
        ...asPack(pack),
        provinces: undefined,
      } as FindOrphanEntitiesPackLike),
    ).toBe("not-ready");
    expect(
      findOrphanEntitiesInPack({
        ...asPack(pack),
        burgs: undefined,
      } as FindOrphanEntitiesPackLike),
    ).toBe("not-ready");
    expect(
      findOrphanEntitiesInPack({
        ...asPack(pack),
        religions: undefined,
      } as FindOrphanEntitiesPackLike),
    ).toBe("not-ready");
  });

  it("emits null name when entity has no name", () => {
    const pack = makeCleanPack();
    const s = pack.states[1];
    if (s) {
      s.capital = 99;
      s.name = undefined;
    }
    const result = findOrphanEntitiesInPack(asPack(pack)) as {
      orphans: OrphanEntity[];
      count: number;
    };
    expect(result.orphans[0]?.name).toBeNull();
  });
});

describe("find_orphan_entities — tool surface", () => {
  it("returns ok payload with orphans and count", async () => {
    const tool = createFindOrphanEntitiesTool(
      runtimeReturning({
        orphans: [
          {
            entity_type: "state",
            i: 1,
            name: "Altaria",
            issue: "state.capital=99 does not reference an active burg",
          },
        ],
        count: 1,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      orphans: [
        {
          entity_type: "state",
          i: 1,
          name: "Altaria",
          issue: "state.capital=99 does not reference an active burg",
        },
      ],
      count: 1,
    });
  });

  it("ignores extra input keys", async () => {
    const tool = createFindOrphanEntitiesTool(
      runtimeReturning({ orphans: [], count: 0 }),
    );
    const result = await tool.execute({ foo: "bar", extra: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({ ok: true, orphans: [], count: 0 });
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindOrphanEntitiesTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("is exported as findOrphanEntitiesTool with the expected schema", () => {
    expect(findOrphanEntitiesTool.name).toBe("find_orphan_entities");
    expect(findOrphanEntitiesTool.input_schema.type).toBe("object");
    expect(findOrphanEntitiesTool.input_schema.required).toBeUndefined();
    expect(findOrphanEntitiesTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultFindOrphanEntitiesRuntime integration -----

describe("defaultFindOrphanEntitiesRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    const pack = makeCleanPack();
    // Seed a deliberate orphan: state 1's capital -> burg 99 (missing)
    if (pack.states[1]) pack.states[1].capital = 99;
    globalsRef.pack = pack as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the live pack and surfaces the seeded orphan", () => {
    const result = defaultFindOrphanEntitiesRuntime.scan();
    expect(result).not.toBe("not-ready");
    const hit = (result as { orphans: OrphanEntity[] }).orphans[0];
    expect(hit).toEqual({
      entity_type: "state",
      i: 1,
      name: "Altaria",
      issue: "state.capital=99 does not reference an active burg",
    });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findOrphanEntitiesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    expect(body.orphans[0].entity_type).toBe("state");
    expect(body.orphans[0].i).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindOrphanEntitiesRuntime.scan()).toBe("not-ready");
    const result = await findOrphanEntitiesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
