import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindRegimentsByTypeTool,
  DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
  defaultFindRegimentsByTypeRuntime,
  type FindRegimentsByTypeResult,
  type FindRegimentsByTypeRuntime,
  findRegimentsByTypeInPack,
  findRegimentsByTypeTool,
  MAX_FIND_REGIMENTS_BY_TYPE_LIMIT,
} from "./find-regiments-by-type";

interface FakeRegiment {
  i: number;
  name?: string;
  icon?: string;
  type?: string;
  x?: number;
  y?: number;
  cell?: number;
  t?: number;
  a?: number;
  u?: Record<string, number>;
  n?: number;
}

interface FakeState {
  i: number;
  name?: string;
  removed?: boolean;
  military?: FakeRegiment[];
}

interface FakePack {
  states: FakeState[];
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findRegimentsByTypeInPack>[0];
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals (phantom military — must be skipped)
  //   1: "Altaria"    — 3 regs: melee, fleet (naval), sparse (no type)
  //   2: "Valorin"    — 2 regs: MELEE (uppercase, still matches melee), ranged
  //   3: "Ghost"      — removed: true (its melee reg must be skipped)
  //   4: "EmptyLand"  — military: []
  //   5: "NoArmy"     — no military field
  //   6: "Mixed"      — 2 regs: cavalry, artillery
  return {
    states: [
      {
        i: 0,
        name: "Neutrals",
        military: [{ i: 0, name: "PhantomMelee", type: "melee", t: 100 }],
      },
      {
        i: 1,
        name: "Altaria",
        military: [
          {
            i: 0,
            name: "1st Altaria Guard",
            icon: "⚔",
            type: "melee",
            x: 100,
            y: 200,
            cell: 1523,
            t: 2400,
            a: 2400,
            n: 0,
          },
          {
            i: 1,
            name: "Altaria Fleet",
            icon: "⛵",
            type: "fleet",
            x: 110,
            y: 210,
            cell: 1700,
            t: 800,
            a: 800,
            n: 1,
          },
          {
            // Sparse regiment — no type. Should never match.
            i: 2,
            name: "Auxiliary",
          },
        ],
      },
      {
        i: 2,
        name: "Valorin",
        military: [
          {
            i: 0,
            name: "Valorin Host",
            icon: "🛡",
            type: "MELEE",
            x: 300,
            y: 400,
            cell: 2000,
            t: 1500,
            n: 0,
          },
          {
            i: 1,
            name: "Valorin Archers",
            icon: "🏹",
            type: "ranged",
            x: 310,
            y: 410,
            cell: 2100,
            t: 900,
            n: 0,
          },
        ],
      },
      {
        i: 3,
        name: "Ghost",
        removed: true,
        military: [{ i: 0, name: "GhostHost", type: "melee", t: 1 }],
      },
      { i: 4, name: "EmptyLand", military: [] },
      { i: 5, name: "NoArmy" },
      {
        i: 6,
        name: "Mixed",
        military: [
          {
            i: 0,
            name: "Mixed Cavalry",
            type: "cavalry",
            x: 500,
            y: 600,
            cell: 3000,
            t: 600,
            n: 0,
          },
          {
            // Defensively sparse: artillery with no icon/x/y/cell/t.
            i: 1,
            name: "Mixed Artillery",
            type: "artillery",
          },
        ],
      },
    ],
  };
}

function runtimeReturning(
  result: FindRegimentsByTypeResult,
): FindRegimentsByTypeRuntime {
  return { find: () => result };
}

function realRuntime(): FindRegimentsByTypeRuntime {
  const pack = asPack(makePack());
  return {
    find: (type, limit) => findRegimentsByTypeInPack(pack, type, limit),
  };
}

describe("find_regiments_by_type — pure scanner", () => {
  it("matches regiments across multiple states (melee)", () => {
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "melee",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as {
      type: string;
      regiments: Array<{ state: { i: number }; i: number }>;
      count: number;
    };
    // Altaria (state 1) regiment 0 + Valorin (state 2) regiment 0 (uppercase MELEE)
    expect(result.count).toBe(2);
    const byState = new Map(result.regiments.map((r) => [r.state.i, r]));
    expect(byState.has(1)).toBe(true);
    expect(byState.has(2)).toBe(true);
    expect(result.type).toBe("melee");
  });

  it("matches case-insensitively on the stored regiment.type", () => {
    // Valorin has type "MELEE" (uppercase). Caller supplies lowercase.
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "melee",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as { regiments: Array<{ state: { i: number }; i: number }> };
    const hit = result.regiments.find((r) => r.state.i === 2);
    expect(hit).toBeDefined();
    expect(hit?.i).toBe(0);
  });

  it("skips i=0 Neutrals state's phantom military", () => {
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "melee",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as { regiments: Array<{ state: { i: number } }>; count: number };
    // Phantom in Neutrals has type "melee" but state i===0 must be skipped.
    const neutralsHits = result.regiments.filter((r) => r.state.i === 0);
    expect(neutralsHits.length).toBe(0);
  });

  it("skips removed states' regiments", () => {
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "melee",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as { regiments: Array<{ state: { i: number } }>; count: number };
    // Ghost state (i=3) is removed; its melee regiment must be skipped.
    const ghostHits = result.regiments.filter((r) => r.state.i === 3);
    expect(ghostHits.length).toBe(0);
  });

  it("skips regiments without a string type", () => {
    // Altaria's regiment 2 is sparse (no type) — should never match anything
    // (including a 'melee' query because it has no type field at all).
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "melee",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as { regiments: Array<{ state: { i: number }; i: number }> };
    const sparseHit = result.regiments.find(
      (r) => r.state.i === 1 && r.i === 2,
    );
    expect(sparseHit).toBeUndefined();
  });

  it("populates state / i / name / icon / x / y / cell / n / naval", () => {
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "fleet",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as {
      regiments: Array<{
        state: { i: number; name: string };
        i: number;
        name: string;
        icon: string | null;
        x: number;
        y: number;
        cell: number;
        n: number;
        naval: boolean;
      }>;
    };
    expect(result.regiments.length).toBe(1);
    expect(result.regiments[0]).toEqual({
      state: { i: 1, name: "Altaria" },
      i: 1,
      name: "Altaria Fleet",
      icon: "⛵",
      x: 110,
      y: 210,
      cell: 1700,
      n: 800,
      naval: true,
    });
  });

  it("falls back to safe defaults when fields are missing", () => {
    // Mixed's artillery regiment has no icon/x/y/cell/t — all must default.
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "artillery",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as {
      regiments: Array<{
        state: { i: number };
        i: number;
        name: string;
        icon: string | null;
        x: number;
        y: number;
        cell: number;
        n: number;
        naval: boolean;
      }>;
    };
    expect(result.regiments).toHaveLength(1);
    expect(result.regiments[0]).toEqual({
      state: { i: 6, name: "Mixed" },
      i: 1,
      name: "Mixed Artillery",
      icon: null,
      x: 0,
      y: 0,
      cell: 0,
      n: 0,
      naval: false,
    });
  });

  it("returns empty list when no regiment matches the type", () => {
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "aviation",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as { regiments: unknown[]; count: number };
    expect(result.regiments).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("truncates `regiments` at limit but preserves full `count`", () => {
    // Two melee hits across states — cap at 1, count still 2.
    const result = findRegimentsByTypeInPack(
      asPack(makePack()),
      "melee",
      1,
    ) as {
      regiments: unknown[];
      count: number;
    };
    expect(result.regiments.length).toBe(1);
    expect(result.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findRegimentsByTypeInPack(
        undefined,
        "melee",
        DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findRegimentsByTypeInPack
    >[0];
    expect(
      findRegimentsByTypeInPack(
        pack,
        "melee",
        DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_regiments_by_type — tool surface", () => {
  it("returns ok=true with echoed type, regiments, and count", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "melee" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("melee");
    expect(body.count).toBe(2);
    expect(
      new Set(body.regiments.map((r: { state: { i: number } }) => r.state.i)),
    ).toEqual(new Set([1, 2]));
  });

  it("accepts type case-insensitively and with whitespace trim", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
    for (const variant of ["FLEET", "fleet", "Fleet", " fleet "]) {
      const result = await tool.execute({ type: variant });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      // Echoed type is trimmed caller input.
      expect(body.type).toBe(variant.trim());
      expect(body.count).toBe(1);
      expect(body.regiments[0].state.i).toBe(1);
    }
  });

  it("rejects missing / non-string / empty type", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
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
      expect(JSON.parse(r.content).error).toMatch(/type/i);
    }
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindRegimentsByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "melee" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "melee", limit: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.regiments.length).toBe(1);
    expect(body.count).toBe(2);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
    for (const bad of [
      { type: "melee", limit: 0 },
      { type: "melee", limit: -1 },
      { type: "melee", limit: 1.5 },
      { type: "melee", limit: "10" },
      { type: "melee", limit: MAX_FIND_REGIMENTS_BY_TYPE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindRegimentsByTypeRuntime = {
      find: (_type, limit) => {
        receivedLimit = limit;
        return { type: "melee", regiments: [], count: 0 };
      },
    };
    const tool = createFindRegimentsByTypeTool(runtime);
    await tool.execute({ type: "melee" });
    expect(receivedLimit).toBe(DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT);
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "melee", limit: 1 });
    expect(r1.isError).toBeFalsy();
    expect(JSON.parse(r1.content).regiments.length).toBe(1);
    const r2 = await tool.execute({
      type: "melee",
      limit: MAX_FIND_REGIMENTS_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).regiments.length).toBe(2);
  });

  it("returns empty list when no regiment matches the type", async () => {
    const tool = createFindRegimentsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "aviation" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.regiments).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findRegimentsByTypeTool with the expected schema", () => {
    expect(findRegimentsByTypeTool.name).toBe("find_regiments_by_type");
    expect(findRegimentsByTypeTool.input_schema.type).toBe("object");
    expect(findRegimentsByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findRegimentsByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findRegimentsByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_REGIMENTS_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindRegimentsByTypeRuntime integration -----

describe("defaultFindRegimentsByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("finds regiments via the default runtime for melee", () => {
    const result = defaultFindRegimentsByTypeRuntime.find(
      "melee",
      DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
    ) as {
      regiments: Array<{ state: { i: number }; i: number }>;
      count: number;
    };
    expect(result.count).toBe(2);
    expect(new Set(result.regiments.map((r) => r.state.i))).toEqual(
      new Set([1, 2]),
    );
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findRegimentsByTypeTool.execute({ type: "fleet" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("fleet");
    expect(body.count).toBe(1);
    expect(body.regiments[0].state).toEqual({ i: 1, name: "Altaria" });
    expect(body.regiments[0].naval).toBe(true);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindRegimentsByTypeRuntime.find(
        "melee",
        DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findRegimentsByTypeTool.execute({ type: "melee" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
