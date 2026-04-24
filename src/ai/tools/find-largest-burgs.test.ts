import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLargestBurgsTool,
  DEFAULT_FIND_LARGEST_BURGS_N,
  defaultFindLargestBurgsRuntime,
  type FindLargestBurgsResult,
  type FindLargestBurgsRuntime,
  findLargestBurgsInPack,
  findLargestBurgsTool,
  MAX_FIND_LARGEST_BURGS_N,
  type ResolveStateResult,
  resolveStateRefInPack,
} from "./find-largest-burgs";

interface FakeBurg {
  i: number;
  name?: string;
  x?: number;
  y?: number;
  population?: number;
  capital?: number;
  state?: number;
  removed?: boolean;
}

interface FakeState {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
}

interface FakePack {
  burgs: FakeBurg[];
  states: FakeState[];
}

function makePack(): FakePack {
  // Burgs (active unless noted):
  //   0: placeholder
  //   1: Astral     pop = 0      capital  state=1
  //   2: Birchwell  pop = 0.5             state=1
  //   3: Coldreach  pop = 1.25            state=2
  //   4: Dusktown   pop = 3.8             state=2
  //   5: Emberkeep  pop = 8.2    capital  state=2
  //   6: Freehold   pop = 20              state=1
  //   7: Ghostholm  pop = 42.6   removed  state=2
  //   8: Orphan     no pop field          state=1
  //   9: Neutra     pop = 5               state=0 (neutrals)
  return {
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Astral",
        x: 100,
        y: 200,
        population: 0,
        capital: 1,
        state: 1,
      },
      {
        i: 2,
        name: "Birchwell",
        x: 110,
        y: 210,
        population: 0.5,
        capital: 0,
        state: 1,
      },
      {
        i: 3,
        name: "Coldreach",
        x: 120,
        y: 220,
        population: 1.25,
        capital: 0,
        state: 2,
      },
      {
        i: 4,
        name: "Dusktown",
        x: 130,
        y: 230,
        population: 3.8,
        capital: 0,
        state: 2,
      },
      {
        i: 5,
        name: "Emberkeep",
        x: 140,
        y: 240,
        population: 8.2,
        capital: 1,
        state: 2,
      },
      {
        i: 6,
        name: "Freehold",
        x: 150,
        y: 250,
        population: 20,
        capital: 0,
        state: 1,
      },
      {
        i: 7,
        name: "Ghostholm",
        x: 0,
        y: 0,
        population: 42.6,
        capital: 0,
        state: 2,
        removed: true,
      },
      { i: 8, name: "Orphan", x: 160, y: 260, state: 1 },
      {
        i: 9,
        name: "Neutra",
        x: 170,
        y: 270,
        population: 5,
        capital: 0,
        state: 0,
      },
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Altaria", fullName: "Kingdom of Altaria" },
      { i: 2, name: "Valorin", fullName: "Republic of Valorin" },
      { i: 3, name: "Gone", removed: true },
    ],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findLargestBurgsInPack>[0];
}

function asStatePack(p: FakePack) {
  return p as unknown as Parameters<typeof resolveStateRefInPack>[0];
}

function runtimeReturning(
  result: FindLargestBurgsResult,
): FindLargestBurgsRuntime {
  return {
    resolveState: () => "not-found",
    find: () => result,
  };
}

function realRuntime(): FindLargestBurgsRuntime {
  const pack = makePack();
  return {
    resolveState: (ref) => resolveStateRefInPack(asStatePack(pack), ref),
    find: (n, stateI) => findLargestBurgsInPack(asPack(pack), n, stateI),
  };
}

describe("find_largest_burgs — pure ranker", () => {
  it("returns burgs sorted by population descending", () => {
    const result = findLargestBurgsInPack(
      asPack(makePack()),
      DEFAULT_FIND_LARGEST_BURGS_N,
      null,
    ) as { burgs: Array<{ i: number; population: number }> };
    // Active numeric-pop burgs: 1 (0), 2 (0.5), 3 (1.25), 4 (3.8), 5 (8.2), 6 (20), 9 (5)
    // Sorted desc: 6, 5, 9, 4, 3, 2, 1
    expect(result.burgs.map((b) => b.i)).toEqual([6, 5, 9, 4, 3, 2, 1]);
    expect(result.burgs[0].population).toBe(20);
    expect(result.burgs[result.burgs.length - 1].population).toBe(0);
  });

  it("slices to top n", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 3, null) as {
      burgs: Array<{ i: number }>;
    };
    expect(result.burgs.map((b) => b.i)).toEqual([6, 5, 9]);
  });

  it("n larger than population returns all eligible burgs", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 500, null) as {
      burgs: Array<{ i: number }>;
    };
    expect(result.burgs).toHaveLength(7);
  });

  it("filters by state id when stateI is set", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 10, 2) as {
      burgs: Array<{ i: number; state_id: number }>;
    };
    // State 2 burgs (non-removed, numeric pop): 3 (1.25), 4 (3.8), 5 (8.2) → sorted: 5, 4, 3
    expect(result.burgs.map((b) => b.i)).toEqual([5, 4, 3]);
    for (const b of result.burgs) expect(b.state_id).toBe(2);
  });

  it("state filter returns empty when no burgs match", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 10, 99) as {
      burgs: unknown[];
    };
    expect(result.burgs).toEqual([]);
  });

  it("skips i=0 placeholder, removed burgs, and non-number population", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 500, null) as {
      burgs: Array<{ i: number }>;
    };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // no numeric population
  });

  it("populates x, y, name, population, capital, state_id from the raw burg", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 1, null) as {
      burgs: Array<{
        i: number;
        name: string;
        x: number;
        y: number;
        population: number;
        capital: boolean;
        state_id: number;
      }>;
    };
    expect(result.burgs).toEqual([
      {
        i: 6,
        name: "Freehold",
        x: 150,
        y: 250,
        population: 20,
        capital: false,
        state_id: 1,
      },
    ]);
  });

  it("marks capital correctly when burg.capital === 1", () => {
    const result = findLargestBurgsInPack(asPack(makePack()), 500, null) as {
      burgs: Array<{ i: number; capital: boolean }>;
    };
    const byId = new Map(result.burgs.map((b) => [b.i, b.capital]));
    expect(byId.get(1)).toBe(true); // Astral capital=1
    expect(byId.get(5)).toBe(true); // Emberkeep capital=1
    expect(byId.get(6)).toBe(false); // Freehold capital=0
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findLargestBurgsInPack(undefined, 10, null)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {} as unknown as Parameters<typeof findLargestBurgsInPack>[0];
    expect(findLargestBurgsInPack(pack, 10, null)).toBe("not-ready");
  });

  it("empty pack.burgs yields empty result", () => {
    const pack = { burgs: [] } as unknown as Parameters<
      typeof findLargestBurgsInPack
    >[0];
    const result = findLargestBurgsInPack(pack, 10, null) as {
      burgs: unknown[];
    };
    expect(result.burgs).toEqual([]);
  });
});

describe("resolveStateRefInPack", () => {
  it("resolves a valid numeric id", () => {
    const resolved = resolveStateRefInPack(
      asStatePack(makePack()),
      2,
    ) as ResolveStateResult;
    expect(resolved).toEqual({ i: 2, name: "Valorin" });
  });

  it("resolves a case-insensitive name", () => {
    const resolved = resolveStateRefInPack(
      asStatePack(makePack()),
      "altaria",
    ) as ResolveStateResult;
    expect(resolved).toEqual({ i: 1, name: "Altaria" });
  });

  it("resolves a case-insensitive fullName", () => {
    const resolved = resolveStateRefInPack(
      asStatePack(makePack()),
      "kingdom of altaria",
    ) as ResolveStateResult;
    expect(resolved).toEqual({ i: 1, name: "Altaria" });
  });

  it("returns 'neutral' for state id 0", () => {
    expect(resolveStateRefInPack(asStatePack(makePack()), 0)).toBe("neutral");
  });

  it("returns 'not-found' for unresolvable refs", () => {
    expect(resolveStateRefInPack(asStatePack(makePack()), 999)).toBe(
      "not-found",
    );
    expect(resolveStateRefInPack(asStatePack(makePack()), "Nowhere")).toBe(
      "not-found",
    );
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as unknown as Parameters<typeof resolveStateRefInPack>[0];
    expect(resolveStateRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_largest_burgs — tool surface", () => {
  it("returns ok=true with top N ranked burgs", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(3);
    expect(body.burgs.map((b: { i: number }) => b.i)).toEqual([6, 5, 9]);
    expect(body.count).toBe(3);
    expect(body.state).toBeNull();
  });

  it("defaults n to DEFAULT_FIND_LARGEST_BURGS_N when omitted", async () => {
    let receivedN = -1;
    const runtime: FindLargestBurgsRuntime = {
      resolveState: () => "not-found",
      find: (n, _stateI) => {
        receivedN = n;
        return { burgs: [] };
      },
    };
    const tool = createFindLargestBurgsTool(runtime);
    await tool.execute({});
    expect(receivedN).toBe(DEFAULT_FIND_LARGEST_BURGS_N);
  });

  it("filters by state id", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    const result = await tool.execute({ state: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.map((b: { i: number }) => b.i)).toEqual([5, 4, 3]);
    expect(body.count).toBe(3);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
  });

  it("filters by state name (case-insensitive)", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    const result = await tool.execute({ state: "valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.map((b: { i: number }) => b.i)).toEqual([5, 4, 3]);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
  });

  it("rejects state 0 (Neutrals placeholder) numerically", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    const r = await tool.execute({ state: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/state 0|Neutrals/i);
  });

  it("rejects unresolvable state", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    const r = await tool.execute({ state: "Nowhere" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/no state found/i);
  });

  it("rejects invalid n", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: 1.5 },
      { n: "10" },
      { n: MAX_FIND_LARGEST_BURGS_N + 1 },
      { n: Number.NaN },
      { n: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/);
    }
  });

  it("returns empty burgs for state with no burgs", async () => {
    // Valid state id resolves but no active burgs exist for it.
    const runtime: FindLargestBurgsRuntime = {
      resolveState: () => ({ i: 42, name: "Empty" }),
      find: () => ({ burgs: [] }),
    };
    const t = createFindLargestBurgsTool(runtime);
    const r = await t.execute({ state: 42 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.burgs).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.state).toEqual({ i: 42, name: "Empty" });
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindLargestBurgsTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces state resolution 'not-ready'", async () => {
    const runtime: FindLargestBurgsRuntime = {
      resolveState: () => "not-ready",
      find: () => ({ burgs: [] }),
    };
    const tool = createFindLargestBurgsTool(runtime);
    const r = await tool.execute({ state: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLargestBurgsTool with the expected schema", () => {
    expect(findLargestBurgsTool.name).toBe("find_largest_burgs");
    expect(findLargestBurgsTool.input_schema.type).toBe("object");
    expect(findLargestBurgsTool.input_schema.properties.n).toBeDefined();
    expect(findLargestBurgsTool.input_schema.properties.state).toBeDefined();
  });

  it("exposes DEFAULT and MAX n constants", () => {
    expect(DEFAULT_FIND_LARGEST_BURGS_N).toBe(10);
    expect(MAX_FIND_LARGEST_BURGS_N).toBe(500);
  });

  it("echoes requested_n and state_id on each hit", async () => {
    const tool = createFindLargestBurgsTool(realRuntime());
    const result = await tool.execute({ n: 2 });
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(2);
    for (const b of body.burgs) {
      expect(typeof b.state_id).toBe("number");
    }
  });
});

// ----- defaultFindLargestBurgsRuntime integration -----

describe("defaultFindLargestBurgsRuntime (integration)", () => {
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
    const result = defaultFindLargestBurgsRuntime.find(3, null) as {
      burgs: Array<{ i: number }>;
    };
    expect(result.burgs.map((b) => b.i)).toEqual([6, 5, 9]);
  });

  it("resolves a state ref via the default runtime", () => {
    expect(defaultFindLargestBurgsRuntime.resolveState(1)).toEqual({
      i: 1,
      name: "Altaria",
    });
    expect(defaultFindLargestBurgsRuntime.resolveState("valorin")).toEqual({
      i: 2,
      name: "Valorin",
    });
    expect(defaultFindLargestBurgsRuntime.resolveState(0)).toBe("neutral");
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findLargestBurgsTool.execute({ n: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.burgs).toHaveLength(1);
    expect(body.burgs[0].i).toBe(6);
    expect(body.burgs[0].name).toBe("Freehold");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLargestBurgsRuntime.find(10, null)).toBe("not-ready");
    const result = await findLargestBurgsTool.execute({ n: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
