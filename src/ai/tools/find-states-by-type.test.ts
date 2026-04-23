import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindStatesByTypeTool,
  DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
  defaultFindStatesByTypeRuntime,
  type FindStatesByTypeResult,
  type FindStatesByTypeRuntime,
  findStatesByTypeInPack,
  findStatesByTypeTool,
  MAX_FIND_STATES_BY_TYPE_LIMIT,
} from "./find-states-by-type";

interface FakePack {
  states: Array<{
    i: number;
    name?: string;
    fullName?: string;
    form?: string;
    color?: string;
    type?: string;
    capital?: number;
    removed?: boolean;
  }>;
  burgs: Array<{
    i: number;
    name?: string;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findStatesByTypeInPack>[0];
}

function makePack(): FakePack {
  // Burgs (only names needed for capital lookup):
  //   0: placeholder
  //   1: "Astral"
  //   2: "Coldreach"
  //   3: "Freehold"
  //
  // States:
  //   0: Neutrals (always skipped) — type Generic, but i===0
  //   1: "Altaria"    type Generic,  capital=1 "Astral"
  //   2: "Birchlands" type generic (lowercase — still matches Generic)
  //   3: "Coldmarch"  type Naval,    capital=2 "Coldreach"
  //   4: "Dusklands"  type Naval,    capital=1 "Astral"
  //   5: "Empirewilds" type Highland, capital=3 "Freehold"
  //   6: "Ghostrealm" type Generic, removed: true — skipped
  //   7: "Orphan"     no type field — skipped
  //   8: "Freewilds"  type Generic, capital=0 (no capital)
  //   9: "Lostcap"    type Generic, capital=99 (missing burg → null)
  return {
    states: [
      { i: 0, name: "Neutrals", type: "Generic" },
      {
        i: 1,
        name: "Altaria",
        fullName: "Kingdom of Altaria",
        form: "Monarchy",
        color: "#aabbcc",
        type: "Generic",
        capital: 1,
      },
      {
        i: 2,
        name: "Birchlands",
        fullName: "Duchy of Birchlands",
        form: "Monarchy",
        color: "#112233",
        type: "generic",
        capital: 0,
      },
      {
        i: 3,
        name: "Coldmarch",
        fullName: "Republic of Coldmarch",
        form: "Republic",
        color: "#445566",
        type: "Naval",
        capital: 2,
      },
      {
        i: 4,
        name: "Dusklands",
        fullName: "Dusklands Thalassocracy",
        form: "Republic",
        color: "#998877",
        type: "Naval",
        capital: 1,
      },
      {
        i: 5,
        name: "Empirewilds",
        fullName: "The Empirewilds",
        form: "Tribal",
        color: "#778899",
        type: "Highland",
        capital: 3,
      },
      {
        i: 6,
        name: "Ghostrealm",
        type: "Generic",
        capital: 0,
        removed: true,
      },
      { i: 7, name: "Orphan" },
      { i: 8, name: "Freewilds", type: "Generic", capital: 0 },
      { i: 9, name: "Lostcap", type: "Generic", capital: 99 },
    ],
    burgs: [
      { i: 0 },
      { i: 1, name: "Astral" },
      { i: 2, name: "Coldreach" },
      { i: 3, name: "Freehold" },
    ],
  };
}

function runtimeReturning(
  result: FindStatesByTypeResult,
): FindStatesByTypeRuntime {
  return { find: () => result };
}

function realRuntime(): FindStatesByTypeRuntime {
  const pack = asPack(makePack());
  return {
    find: (type, limit) => findStatesByTypeInPack(pack, type, limit),
  };
}

describe("find_states_by_type — pure scanner", () => {
  it("matches states by type case-insensitively (Generic)", () => {
    const result = findStatesByTypeInPack(
      asPack(makePack()),
      "Generic",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as {
      type: string;
      states: Array<{ i: number; capital: string | null }>;
      count: number;
    };
    const ids = new Set(result.states.map((s) => s.i));
    // Generic states: 1 ("Generic"), 2 ("generic"), 8, 9; 6 removed
    expect(ids).toEqual(new Set([1, 2, 8, 9]));
    expect(result.count).toBe(4);
    expect(result.type).toBe("Generic");
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(1)?.capital).toBe("Astral");
    expect(byId.get(2)?.capital).toBeNull(); // capital=0
    expect(byId.get(8)?.capital).toBeNull(); // capital=0
    expect(byId.get(9)?.capital).toBeNull(); // capital=99 (missing burg)
  });

  it("returns states for a second type cleanly (no cross-contamination)", () => {
    const result = findStatesByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as {
      states: Array<{ i: number; capital: string | null }>;
      count: number;
    };
    const ids = new Set(result.states.map((s) => s.i));
    expect(ids).toEqual(new Set([3, 4]));
    expect(result.count).toBe(2);
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(3)?.capital).toBe("Coldreach");
    expect(byId.get(4)?.capital).toBe("Astral");
  });

  it("returns empty list when no state has the given type", () => {
    const result = findStatesByTypeInPack(
      asPack(makePack()),
      "Nomadic",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as { states: unknown[]; count: number };
    expect(result.states).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 Neutrals, removed states, and states with no type", () => {
    // The only Highland state is 5, and it's the only one. Neutrals (i=0)
    // has type Generic but must be skipped. State 7 has no type.
    const highland = findStatesByTypeInPack(
      asPack(makePack()),
      "Highland",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as { states: Array<{ i: number }>; count: number };
    expect(new Set(highland.states.map((s) => s.i))).toEqual(new Set([5]));
    expect(highland.count).toBe(1);

    const generic = findStatesByTypeInPack(
      asPack(makePack()),
      "Generic",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as { states: Array<{ i: number }>; count: number };
    const ids = new Set(generic.states.map((s) => s.i));
    expect(ids.has(0)).toBe(false); // Neutrals skipped
    expect(ids.has(6)).toBe(false); // removed skipped
    expect(ids.has(7)).toBe(false); // no type skipped
  });

  it("truncates `states` at limit but preserves full `count`", () => {
    const result = findStatesByTypeInPack(asPack(makePack()), "Generic", 2) as {
      states: Array<{ i: number }>;
      count: number;
    };
    expect(result.states.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("populates name, fullName, form, color, capital fields", () => {
    const result = findStatesByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
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

  it("falls back to null for missing fullName / form / color", () => {
    const result = findStatesByTypeInPack(
      asPack(makePack()),
      "Generic",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as {
      states: Array<{
        i: number;
        fullName: string | null;
        form: string | null;
        color: string | null;
      }>;
    };
    const byId = new Map(result.states.map((s) => [s.i, s]));
    // state 8 "Freewilds" has no fullName/form/color in the fixture
    expect(byId.get(8)?.fullName).toBeNull();
    expect(byId.get(8)?.form).toBeNull();
    expect(byId.get(8)?.color).toBeNull();
  });

  it("returns capital=null when state.capital references missing burg", () => {
    const result = findStatesByTypeInPack(
      asPack(makePack()),
      "Generic",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as {
      states: Array<{ i: number; capital: string | null }>;
    };
    const byId = new Map(result.states.map((s) => [s.i, s]));
    expect(byId.get(9)?.capital).toBeNull();
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findStatesByTypeInPack(
        undefined,
        "Generic",
        DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as unknown as Parameters<typeof findStatesByTypeInPack>[0];
    expect(
      findStatesByTypeInPack(
        pack,
        "Generic",
        DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_states_by_type — tool surface", () => {
  it("returns ok=true with canonical type, states, and count", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Generic" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Generic");
    expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
      new Set([1, 2, 8, 9]),
    );
    expect(body.count).toBe(4);
  });

  it("accepts type case-insensitively and echoes canonical casing", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    for (const variant of ["naval", "NAVAL", "Naval", " naval "]) {
      const result = await tool.execute({ type: variant });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.type).toBe("Naval");
      expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
        new Set([3, 4]),
      );
    }
  });

  it("rejects missing / non-string / empty type", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    for (const bad of [
      {},
      { type: null },
      { type: "" },
      { type: "   " },
      { type: 42 },
      { type: true },
      { type: [] },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      const body = JSON.parse(r.content);
      expect(body.error).toMatch(/type/i);
      // Supported list is echoed for type-related errors.
      expect(Array.isArray(body.supported)).toBe(true);
    }
  });

  it("rejects unknown type with the supported list", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Desert" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/unknown state type/i);
    expect(body.supported).toEqual(
      expect.arrayContaining(["Generic", "Naval", "Highland"]),
    );
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindStatesByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "Generic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Generic", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.states.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    for (const bad of [
      { type: "Generic", limit: 0 },
      { type: "Generic", limit: -1 },
      { type: "Generic", limit: 1.5 },
      { type: "Generic", limit: "10" },
      { type: "Generic", limit: MAX_FIND_STATES_BY_TYPE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindStatesByTypeRuntime = {
      find: (_type, limit) => {
        receivedLimit = limit;
        return { type: "Generic", states: [], count: 0 };
      },
    };
    const tool = createFindStatesByTypeTool(runtime);
    await tool.execute({ type: "Generic" });
    expect(receivedLimit).toBe(DEFAULT_FIND_STATES_BY_TYPE_LIMIT);
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "Generic", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.states.length).toBe(1);
    expect(b1.count).toBe(4);
    const r2 = await tool.execute({
      type: "Generic",
      limit: MAX_FIND_STATES_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).states.length).toBe(4);
  });

  it("returns empty list when no state matches the type", async () => {
    const tool = createFindStatesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Nomadic" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Nomadic");
    expect(body.states).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findStatesByTypeTool with the expected schema", () => {
    expect(findStatesByTypeTool.name).toBe("find_states_by_type");
    expect(findStatesByTypeTool.input_schema.type).toBe("object");
    expect(findStatesByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findStatesByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findStatesByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_STATES_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_STATES_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindStatesByTypeRuntime integration -----

describe("defaultFindStatesByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("finds states via the default runtime for Generic", () => {
    const result = defaultFindStatesByTypeRuntime.find(
      "Generic",
      DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
    ) as { states: Array<{ i: number }>; count: number };
    expect(new Set(result.states.map((s) => s.i))).toEqual(
      new Set([1, 2, 8, 9]),
    );
    expect(result.count).toBe(4);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findStatesByTypeTool.execute({ type: "Naval" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Naval");
    expect(new Set(body.states.map((s: { i: number }) => s.i))).toEqual(
      new Set([3, 4]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindStatesByTypeRuntime.find(
        "Generic",
        DEFAULT_FIND_STATES_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findStatesByTypeTool.execute({ type: "Generic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
