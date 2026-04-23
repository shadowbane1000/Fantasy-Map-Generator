import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindStatesByCultureTool,
  DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
  defaultFindStatesByCultureRuntime,
  type FindStatesByCultureResult,
  type FindStatesByCultureRuntime,
  findStatesByCultureInPack,
  findStatesByCultureTool,
  MAX_FIND_STATES_BY_CULTURE_LIMIT,
  type ResolveCultureResult,
  resolveCultureRefInPack,
} from "./find-states-by-culture";

interface FakePack {
  states: Array<{
    i: number;
    name?: string;
    fullName?: string;
    form?: string;
    color?: string;
    culture?: number;
    capital?: number;
    removed?: boolean;
  }>;
  cultures: Array<{
    i: number;
    name?: string;
    removed?: boolean;
  }>;
  burgs: Array<{
    i: number;
    name?: string;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findStatesByCultureInPack>[0];
}

function makePack(): FakePack {
  // Cultures:
  //   0: "Wildlands" (allowed target)
  //   1: "Highlanders"
  //   2: "Seafarers"
  //   3: "Ghost" (removed)
  //   4: "EmptyFolk" (no states point here)
  //
  // Burgs (only names needed for capital lookup):
  //   0: placeholder
  //   1: "Astral"
  //   2: "Coldreach"
  //   3: "Freehold"
  //
  // States:
  //   0: Neutrals (always skipped) — culture 0, but i===0
  //   1: "Altaria"    culture 1, capital=1 "Astral"
  //   2: "Birchlands" culture 1, capital=0 (no capital)
  //   3: "Coldmarch"  culture 2, capital=2 "Coldreach"
  //   4: "Dusklands"  culture 1, capital=99 (missing burg → null)
  //   5: "Empirewilds" culture 0 (Wildlands), capital=3 "Freehold"
  //   6: "Ghostrealm" culture 1, removed: true — skipped
  //   7: "Orphan"     no culture field — won't match anything non-null numeric
  return {
    states: [
      { i: 0, name: "Neutrals", culture: 0 },
      {
        i: 1,
        name: "Altaria",
        fullName: "Kingdom of Altaria",
        form: "Monarchy",
        color: "#aabbcc",
        culture: 1,
        capital: 1,
      },
      {
        i: 2,
        name: "Birchlands",
        fullName: "Duchy of Birchlands",
        form: "Monarchy",
        color: "#112233",
        culture: 1,
        capital: 0,
      },
      {
        i: 3,
        name: "Coldmarch",
        fullName: "Republic of Coldmarch",
        form: "Republic",
        color: "#445566",
        culture: 2,
        capital: 2,
      },
      {
        i: 4,
        name: "Dusklands",
        culture: 1,
        capital: 99, // missing burg index
      },
      {
        i: 5,
        name: "Empirewilds",
        fullName: "The Empirewilds",
        form: "Tribal",
        color: "#778899",
        culture: 0,
        capital: 3,
      },
      {
        i: 6,
        name: "Ghostrealm",
        culture: 1,
        capital: 0,
        removed: true,
      },
      { i: 7, name: "Orphan" },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Highlanders" },
      { i: 2, name: "Seafarers" },
      { i: 3, name: "Ghost", removed: true },
      { i: 4, name: "EmptyFolk" },
    ],
    burgs: [
      { i: 0 },
      { i: 1, name: "Astral" },
      { i: 2, name: "Coldreach" },
      { i: 3, name: "Freehold" },
    ],
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveCultureResult;
  find?: FindStatesByCultureResult;
}): FindStatesByCultureRuntime {
  return {
    resolveCulture: () => opts.resolve ?? { i: 1, name: "Highlanders" },
    find: () => opts.find ?? { states: [], count: 0 },
  };
}

function realRuntime(): FindStatesByCultureRuntime {
  const pack = asPack(makePack());
  return {
    resolveCulture: (ref) => resolveCultureRefInPack(pack, ref),
    find: (cultureI, limit) => findStatesByCultureInPack(pack, cultureI, limit),
  };
}

describe("find_states_by_culture — pure scanner", () => {
  it("returns every active state for a culture with multiple states", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as {
      states: Array<{ i: number; capital: string | null }>;
      count: number;
    };
    const ids = new Set(result.states.map((s) => s.i));
    // culture 1 states: 1, 2, 4 (6 is removed)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(1)?.capital).toBe("Astral");
    expect(byId.get(2)?.capital).toBeNull(); // capital=0
    expect(byId.get(4)?.capital).toBeNull(); // burg missing
  });

  it("returns states for a second culture cleanly (no cross-contamination)", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as { states: Array<{ i: number }>; count: number };
    const ids = new Set(result.states.map((s) => s.i));
    expect(ids).toEqual(new Set([3]));
    expect(result.count).toBe(1);
  });

  it("returns Wildlands (culture 0) states and still skips Neutrals (state 0)", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      0,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as {
      states: Array<{ i: number; capital: string | null }>;
      count: number;
    };
    const ids = new Set(result.states.map((s) => s.i));
    // state 5 has culture 0; Neutrals (i=0) must be skipped even though it has culture 0
    expect(ids).toEqual(new Set([5]));
    expect(ids.has(0)).toBe(false);
    expect(result.count).toBe(1);
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(5)?.capital).toBe("Freehold");
  });

  it("returns empty list when the culture has no states", () => {
    // culture 4 (EmptyFolk) exists in fixture but no state points to it.
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      4,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as { states: unknown[]; count: number };
    expect(result.states).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 Neutrals and removed states", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as { states: Array<{ i: number }>; count: number };
    const ids = new Set(result.states.map((s) => s.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(6)).toBe(false); // removed
  });

  it("truncates `states` at limit but preserves full `count`", () => {
    const result = findStatesByCultureInPack(asPack(makePack()), 1, 2) as {
      states: Array<{ i: number }>;
      count: number;
    };
    expect(result.states.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates name, fullName, form, color, capital fields", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as {
      states: Array<{
        i: number;
        name: string;
        fullName: string | null;
        form: string | null;
        color: string | null;
        capital: string | null;
      }>;
    };
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(3)).toEqual({
      i: 3,
      name: "Coldmarch",
      fullName: "Republic of Coldmarch",
      form: "Republic",
      color: "#445566",
      capital: "Coldreach",
    });
  });

  it("returns capital=null when state.capital references missing burg", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as {
      states: Array<{ i: number; capital: string | null }>;
    };
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(4)?.capital).toBeNull();
  });

  it("falls back to null for missing fullName / form / color", () => {
    const result = findStatesByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as {
      states: Array<{
        i: number;
        fullName: string | null;
        form: string | null;
        color: string | null;
      }>;
    };
    const byId = new Map(result.states.map((s) => [s.i, s]));
    // state 4 "Dusklands" has none of these in the fixture
    expect(byId.get(4)?.fullName).toBeNull();
    expect(byId.get(4)?.form).toBeNull();
    expect(byId.get(4)?.color).toBeNull();
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findStatesByCultureInPack(
        undefined,
        1,
        DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findStatesByCultureInPack
    >[0];
    expect(
      findStatesByCultureInPack(pack, 1, DEFAULT_FIND_STATES_BY_CULTURE_LIMIT),
    ).toBe("not-ready");
  });
});

describe("resolveCultureRefInPack (find-states-by-culture)", () => {
  it("resolves numeric id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 1)).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("resolves case-insensitive name", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), "highlanders")).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("allows numeric 0 (Wildlands)", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 0)).toEqual({
      i: 0,
      name: "Wildlands",
    });
  });

  it("returns 'not-found' for unknown name", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), "nowhere")).toBe(
      "not-found",
    );
  });

  it("returns 'not-found' for removed culture by id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 3)).toBe("not-found");
  });

  it("returns 'not-found' for out-of-range id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 99)).toBe("not-found");
  });

  it("returns 'not-ready' when cultures missing", () => {
    const pack = {} as unknown as Parameters<typeof resolveCultureRefInPack>[0];
    expect(resolveCultureRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_states_by_culture — tool surface", () => {
  it("returns ok=true with resolved culture, states, and count (numeric)", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 1, name: "Highlanders" });
    expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string culture name (case-insensitive)", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    const result = await tool.execute({ culture: "seafarers" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toEqual({ i: 2, name: "Seafarers" });
    expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
      new Set([3]),
    );
    expect(body.count).toBe(1);
  });

  it("accepts culture 0 (Wildlands)", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toEqual({ i: 0, name: "Wildlands" });
    expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
      new Set([5]),
    );
    expect(body.count).toBe(1);
  });

  it("rejects missing / invalid culture", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    for (const bad of [
      {},
      { culture: null },
      { culture: "" },
      { culture: "   " },
      { culture: -1 },
      { culture: 1.5 },
      { culture: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /culture must be a non-negative integer id or a non-empty name string/i,
      );
    }
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    const result = await tool.execute({ culture: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no culture found/i);
  });

  it("surfaces 'not-ready' from resolveCulture as a structured error", async () => {
    const tool = createFindStatesByCultureTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindStatesByCultureTool(
      runtimeReturning({
        resolve: { i: 1, name: "Highlanders" },
        find: "not-ready",
      }),
    );
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("rejects culture removed (resolves to not-found)", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no culture found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.states.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindStatesByCultureTool(realRuntime());
    for (const bad of [
      { culture: 1, limit: 0 },
      { culture: 1, limit: -1 },
      { culture: 1, limit: 1.5 },
      { culture: 1, limit: "10" },
      { culture: 1, limit: MAX_FIND_STATES_BY_CULTURE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindStatesByCultureRuntime = {
      resolveCulture: () => ({ i: 1, name: "Highlanders" }),
      find: (_cultureI, limit) => {
        receivedLimit = limit;
        return { states: [], count: 0 };
      },
    };
    const tool = createFindStatesByCultureTool(runtime);
    await tool.execute({ culture: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_STATES_BY_CULTURE_LIMIT);
  });

  it("returns empty list when the culture has no states", async () => {
    const runtime: FindStatesByCultureRuntime = {
      resolveCulture: () => ({ i: 4, name: "EmptyFolk" }),
      find: () => ({ states: [], count: 0 }),
    };
    const tool = createFindStatesByCultureTool(runtime);
    const result = await tool.execute({ culture: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 4, name: "EmptyFolk" });
    expect(body.states).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findStatesByCultureTool with the expected schema", () => {
    expect(findStatesByCultureTool.name).toBe("find_states_by_culture");
    expect(findStatesByCultureTool.input_schema.type).toBe("object");
    expect(findStatesByCultureTool.input_schema.required).toEqual(["culture"]);
    expect(
      findStatesByCultureTool.input_schema.properties.culture,
    ).toBeDefined();
    expect(findStatesByCultureTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_STATES_BY_CULTURE_LIMIT).toBe(10000);
    expect(MAX_FIND_STATES_BY_CULTURE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindStatesByCultureRuntime integration -----

describe("defaultFindStatesByCultureRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a culture via the default runtime", () => {
    expect(
      defaultFindStatesByCultureRuntime.resolveCulture("Highlanders"),
    ).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("finds states via the default runtime for culture 1", () => {
    const result = defaultFindStatesByCultureRuntime.find(
      1,
      DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
    ) as { states: Array<{ i: number }>; count: number };
    expect(new Set(result.states.map((s) => s.i))).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findStatesByCultureTool.execute({
      culture: "Seafarers",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 2, name: "Seafarers" });
    expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
      new Set([3]),
    );
    expect(body.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindStatesByCultureRuntime.resolveCulture(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindStatesByCultureRuntime.find(
        1,
        DEFAULT_FIND_STATES_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findStatesByCultureTool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
