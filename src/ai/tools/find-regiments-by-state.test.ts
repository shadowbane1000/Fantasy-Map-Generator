import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindRegimentsByStateTool,
  DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
  defaultFindRegimentsByStateRuntime,
  type FindRegimentsByStateResult,
  type FindRegimentsByStateRuntime,
  findRegimentsByStateInPack,
  findRegimentsByStateTool,
  MAX_FIND_REGIMENTS_BY_STATE_LIMIT,
  type ResolveStateResult,
  resolveStateRefInPack,
} from "./find-regiments-by-state";

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
  fullName?: string;
  removed?: boolean;
  military?: FakeRegiment[];
}

interface FakePack {
  states: FakeState[];
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findRegimentsByStateInPack>[0];
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals placeholder (with phantom military — should not be reachable via tool)
  //   1: "Altaria" (with fullName), 3 regiments (one naval)
  //   2: "Valorin", 1 regiment
  //   3: "Ghost" (removed)
  //   4: "EmptyLand" (military: [])
  //   5: "NoArmy" (no military field)
  return {
    states: [
      {
        i: 0,
        name: "Neutrals",
        military: [{ i: 0, name: "Phantom", t: 100 }],
      },
      {
        i: 1,
        name: "Altaria",
        fullName: "Kingdom of Altaria",
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
            u: { melee: 2400 },
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
            u: { fleet: 800 },
            n: 1,
          },
          {
            // Defensive: sparse regiment with minimal fields.
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
            type: "ranged",
            x: 300,
            y: 400,
            cell: 2000,
            t: 1500,
            n: 0,
          },
        ],
      },
      { i: 3, name: "Ghost", removed: true, military: [{ i: 0, name: "X" }] },
      { i: 4, name: "EmptyLand", military: [] },
      { i: 5, name: "NoArmy" },
    ],
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveStateResult;
  find?: FindRegimentsByStateResult;
}): FindRegimentsByStateRuntime {
  return {
    resolveState: () => opts.resolve ?? { i: 1, name: "Altaria" },
    find: () => opts.find ?? { regiments: [], count: 0 },
  };
}

function realRuntime(): FindRegimentsByStateRuntime {
  const pack = asPack(makePack());
  return {
    resolveState: (ref) => resolveStateRefInPack(pack, ref),
    find: (stateI, limit) => findRegimentsByStateInPack(pack, stateI, limit),
  };
}

describe("find_regiments_by_state — pure scanner", () => {
  it("returns every regiment for a state with multiple regiments", () => {
    const result = findRegimentsByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
    ) as {
      regiments: Array<{ i: number; naval: boolean; type: string | null }>;
      count: number;
    };
    const ids = new Set(result.regiments.map((r) => r.i));
    expect(ids).toEqual(new Set([0, 1, 2]));
    expect(result.count).toBe(3);
    const byId = new Map(result.regiments.map((r) => [r.i, r]));
    expect(byId.get(0)?.naval).toBe(false);
    expect(byId.get(1)?.naval).toBe(true);
    expect(byId.get(0)?.type).toBe("melee");
    expect(byId.get(1)?.type).toBe("fleet");
    expect(byId.get(2)?.type).toBeNull();
  });

  it("returns regiments for a second state cleanly (no cross-contamination)", () => {
    const result = findRegimentsByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
    ) as { regiments: Array<{ i: number }>; count: number };
    const ids = new Set(result.regiments.map((r) => r.i));
    expect(ids).toEqual(new Set([0]));
    expect(result.count).toBe(1);
  });

  it("populates i / name / icon / x / y / cell / n / type / naval from raw", () => {
    const result = findRegimentsByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
    ) as {
      regiments: Array<{
        i: number;
        name: string;
        icon: string | null;
        x: number;
        y: number;
        cell: number;
        n: number;
        type: string | null;
        naval: boolean;
      }>;
    };
    const byId = new Map(result.regiments.map((r) => [r.i, r]));
    expect(byId.get(0)).toEqual({
      i: 0,
      name: "1st Altaria Guard",
      icon: "⚔",
      x: 100,
      y: 200,
      cell: 1523,
      n: 2400,
      type: "melee",
      naval: false,
    });
    expect(byId.get(1)).toEqual({
      i: 1,
      name: "Altaria Fleet",
      icon: "⛵",
      x: 110,
      y: 210,
      cell: 1700,
      n: 800,
      type: "fleet",
      naval: true,
    });
  });

  it("falls back to safe defaults when fields are missing", () => {
    const result = findRegimentsByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
    ) as {
      regiments: Array<{
        i: number;
        name: string;
        icon: string | null;
        x: number;
        y: number;
        cell: number;
        n: number;
        type: string | null;
        naval: boolean;
      }>;
    };
    const aux = result.regiments.find((r) => r.i === 2);
    expect(aux).toEqual({
      i: 2,
      name: "Auxiliary",
      icon: null,
      x: 0,
      y: 0,
      cell: 0,
      n: 0,
      type: null,
      naval: false,
    });
  });

  it("returns empty list when the state has no regiments", () => {
    const result = findRegimentsByStateInPack(
      asPack(makePack()),
      4,
      DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
    ) as { regiments: unknown[]; count: number };
    expect(result.regiments).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("truncates `regiments` at limit but preserves full `count`", () => {
    const result = findRegimentsByStateInPack(asPack(makePack()), 1, 2) as {
      regiments: Array<{ i: number }>;
      count: number;
    };
    expect(result.regiments.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findRegimentsByStateInPack(
        undefined,
        1,
        DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findRegimentsByStateInPack
    >[0];
    expect(
      findRegimentsByStateInPack(
        pack,
        1,
        DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when the target state slot is missing", () => {
    expect(
      findRegimentsByStateInPack(
        asPack(makePack()),
        99,
        DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when the target state has no military array", () => {
    expect(
      findRegimentsByStateInPack(
        asPack(makePack()),
        5,
        DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("resolveStateRefInPack (regiments)", () => {
  it("resolves numeric id", () => {
    expect(resolveStateRefInPack(asPack(makePack()), 1)).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("resolves case-insensitive name", () => {
    expect(resolveStateRefInPack(asPack(makePack()), "altaria")).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("resolves case-insensitive fullName", () => {
    expect(
      resolveStateRefInPack(asPack(makePack()), "kingdom of altaria"),
    ).toEqual({ i: 1, name: "Altaria" });
  });

  it("returns 'neutral' for numeric 0", () => {
    expect(resolveStateRefInPack(asPack(makePack()), 0)).toBe("neutral");
  });

  it("returns 'not-found' for unknown name", () => {
    expect(resolveStateRefInPack(asPack(makePack()), "nowhere")).toBe(
      "not-found",
    );
  });

  it("returns 'not-found' for removed state by id", () => {
    expect(resolveStateRefInPack(asPack(makePack()), 3)).toBe("not-found");
  });

  it("returns 'not-ready' when states missing", () => {
    const pack = {} as unknown as Parameters<typeof resolveStateRefInPack>[0];
    expect(resolveStateRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_regiments_by_state — tool surface", () => {
  it("returns ok=true with resolved state, regiments, and count (numeric)", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 1, name: "Altaria" });
    expect(new Set(body.regiments.map((r: { i: number }) => r.i))).toEqual(
      new Set([0, 1, 2]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string state name (case-insensitive)", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: "valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(body.regiments.length).toBe(1);
    expect(body.count).toBe(1);
  });

  it("accepts fullName case-insensitively", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: "Kingdom Of Altaria" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state.i).toBe(1);
  });

  it("rejects state=0 with a Neutrals-specific error", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
  });

  it("rejects missing / invalid state", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    for (const bad of [
      {},
      { state: null },
      { state: "" },
      { state: "   " },
      { state: -1 },
      { state: 1.5 },
      { state: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /state must be a positive integer id or a non-empty name string/i,
      );
    }
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("surfaces 'not-ready' from resolveState as a structured error", async () => {
    const tool = createFindRegimentsByStateTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindRegimentsByStateTool(
      runtimeReturning({
        resolve: { i: 1, name: "Altaria" },
        find: "not-ready",
      }),
    );
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("rejects state removed (resolves to not-found)", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    const result = await tool.execute({ state: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.regiments.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindRegimentsByStateTool(realRuntime());
    for (const bad of [
      { state: 1, limit: 0 },
      { state: 1, limit: -1 },
      { state: 1, limit: 1.5 },
      { state: 1, limit: "10" },
      { state: 1, limit: MAX_FIND_REGIMENTS_BY_STATE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindRegimentsByStateRuntime = {
      resolveState: () => ({ i: 1, name: "Altaria" }),
      find: (_stateI, limit) => {
        receivedLimit = limit;
        return { regiments: [], count: 0 };
      },
    };
    const tool = createFindRegimentsByStateTool(runtime);
    await tool.execute({ state: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT);
  });

  it("returns empty list when the state has no regiments", async () => {
    const runtime: FindRegimentsByStateRuntime = {
      resolveState: () => ({ i: 4, name: "EmptyLand" }),
      find: () => ({ regiments: [], count: 0 }),
    };
    const tool = createFindRegimentsByStateTool(runtime);
    const result = await tool.execute({ state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 4, name: "EmptyLand" });
    expect(body.regiments).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findRegimentsByStateTool with the expected schema", () => {
    expect(findRegimentsByStateTool.name).toBe("find_regiments_by_state");
    expect(findRegimentsByStateTool.input_schema.type).toBe("object");
    expect(findRegimentsByStateTool.input_schema.required).toEqual(["state"]);
    expect(
      findRegimentsByStateTool.input_schema.properties.state,
    ).toBeDefined();
    expect(
      findRegimentsByStateTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT).toBe(10000);
    expect(MAX_FIND_REGIMENTS_BY_STATE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindRegimentsByStateRuntime integration -----

describe("defaultFindRegimentsByStateRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a state via the default runtime", () => {
    expect(defaultFindRegimentsByStateRuntime.resolveState("Altaria")).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("finds regiments via the default runtime for state 1", () => {
    const result = defaultFindRegimentsByStateRuntime.find(
      1,
      DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
    ) as { regiments: Array<{ i: number }>; count: number };
    expect(new Set(result.regiments.map((r) => r.i))).toEqual(
      new Set([0, 1, 2]),
    );
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findRegimentsByStateTool.execute({
      state: "Valorin",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(body.regiments.length).toBe(1);
    expect(body.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindRegimentsByStateRuntime.resolveState(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindRegimentsByStateRuntime.find(
        1,
        DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findRegimentsByStateTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
