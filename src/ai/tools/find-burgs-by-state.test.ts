import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsByStateTool,
  DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
  defaultFindBurgsByStateRuntime,
  type FindBurgsByStateResult,
  type FindBurgsByStateRuntime,
  findBurgsByStateInPack,
  findBurgsByStateTool,
  MAX_FIND_BURGS_BY_STATE_LIMIT,
  type ResolveStateResult,
  resolveStateRefInPack,
} from "./find-burgs-by-state";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    state?: number;
    capital?: number;
    population?: number;
    removed?: boolean;
  }>;
  states: Array<{
    i: number;
    name?: string;
    fullName?: string;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsByStateInPack>[0];
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals placeholder
  //   1: "Altaria" (with fullName)
  //   2: "Valorin"
  //   3: "Ghost" (removed)
  //
  // Burgs:
  //   0: placeholder
  //   1: Capital of state 1 (capital=1)
  //   2: town in state 1
  //   3: town in state 2
  //   4: town in state 1 (capital=0)
  //   5: town in state 2 (capital=1)
  //   6: town in neutrals (state 0)
  //   7: removed, state 1 — should be skipped
  //   8: no state field, should not match anything non-zero
  return {
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Astral",
        x: 100,
        y: 200,
        state: 1,
        capital: 1,
        population: 12.5,
      },
      {
        i: 2,
        name: "Birchwell",
        x: 110,
        y: 210,
        state: 1,
        capital: 0,
        population: 4.3,
      },
      {
        i: 3,
        name: "Coldreach",
        x: 300,
        y: 400,
        state: 2,
        capital: 0,
        population: 2.1,
      },
      {
        i: 4,
        name: "Dusktown",
        x: 115,
        y: 220,
        state: 1,
        capital: 0,
        population: 1.2,
      },
      {
        i: 5,
        name: "Emberkeep",
        x: 320,
        y: 410,
        state: 2,
        capital: 1,
        population: 8.0,
      },
      {
        i: 6,
        name: "Freehold",
        x: 500,
        y: 500,
        state: 0,
        capital: 0,
        population: 0.5,
      },
      {
        i: 7,
        name: "Gone",
        x: 0,
        y: 0,
        state: 1,
        capital: 0,
        population: 1,
        removed: true,
      },
      { i: 8, name: "Orphan", x: 0, y: 0 },
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Altaria", fullName: "Kingdom of Altaria" },
      { i: 2, name: "Valorin" },
      { i: 3, name: "Ghost", removed: true },
    ],
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveStateResult;
  find?: FindBurgsByStateResult;
}): FindBurgsByStateRuntime {
  return {
    resolveState: () => opts.resolve ?? { i: 1, name: "Altaria" },
    find: () => opts.find ?? { burgs: [], count: 0 },
  };
}

function realRuntime(): FindBurgsByStateRuntime {
  const pack = asPack(makePack());
  return {
    resolveState: (ref) => resolveStateRefInPack(pack, ref),
    find: (stateI, limit) => findBurgsByStateInPack(pack, stateI, limit),
  };
}

describe("find_burgs_by_state — pure scanner", () => {
  it("returns every active burg for a state with multiple burgs", () => {
    const result = findBurgsByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    // state 1 burgs: 1, 2, 4 (7 is removed)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
    // Capital flag comes from burg.capital === 1.
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(1)?.capital).toBe(true);
    expect(byId.get(2)?.capital).toBe(false);
    expect(byId.get(4)?.capital).toBe(false);
  });

  it("returns burgs for a second state cleanly (no cross-contamination)", () => {
    const result = findBurgsByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([3, 5]));
    expect(result.count).toBe(2);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(3)?.capital).toBe(false);
    expect(byId.get(5)?.capital).toBe(true);
  });

  it("returns empty list when the state has no burgs", () => {
    // state 3 (Ghost) exists in fixture but no burg points to it.
    const result = findBurgsByStateInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
    ) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed burgs", () => {
    const result = findBurgsByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("truncates `burgs` at limit but preserves full `count`", () => {
    const result = findBurgsByStateInPack(asPack(makePack()), 1, 2) as {
      burgs: Array<{ i: number }>;
      count: number;
    };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates x, y, name, population from the raw burg", () => {
    const result = findBurgsByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
    ) as {
      burgs: Array<{
        i: number;
        name: string;
        x: number;
        y: number;
        population: number;
      }>;
    };
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(5)).toEqual({
      i: 5,
      name: "Emberkeep",
      x: 320,
      y: 410,
      population: 8.0,
      capital: true,
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findBurgsByStateInPack(undefined, 1, DEFAULT_FIND_BURGS_BY_STATE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {} as unknown as Parameters<typeof findBurgsByStateInPack>[0];
    expect(
      findBurgsByStateInPack(pack, 1, DEFAULT_FIND_BURGS_BY_STATE_LIMIT),
    ).toBe("not-ready");
  });
});

describe("resolveStateRefInPack", () => {
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

describe("find_burgs_by_state — tool surface", () => {
  it("returns ok=true with resolved state, burgs, and count (numeric)", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 1, name: "Altaria" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string state name (case-insensitive)", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: "valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("accepts fullName case-insensitively", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: "Kingdom Of Altaria" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state.i).toBe(1);
  });

  it("rejects state=0 with a Neutrals-specific error", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
  });

  it("rejects missing / invalid state", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
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
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("surfaces 'not-ready' from resolveState as a structured error", async () => {
    const tool = createFindBurgsByStateTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindBurgsByStateTool(
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
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
    const result = await tool.execute({ state: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindBurgsByStateTool(realRuntime());
    for (const bad of [
      { state: 1, limit: 0 },
      { state: 1, limit: -1 },
      { state: 1, limit: 1.5 },
      { state: 1, limit: "10" },
      { state: 1, limit: MAX_FIND_BURGS_BY_STATE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindBurgsByStateRuntime = {
      resolveState: () => ({ i: 1, name: "Altaria" }),
      find: (_stateI, limit) => {
        receivedLimit = limit;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByStateTool(runtime);
    await tool.execute({ state: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_BURGS_BY_STATE_LIMIT);
  });

  it("returns empty list when the state has no burgs", async () => {
    const runtime: FindBurgsByStateRuntime = {
      resolveState: () => ({ i: 4, name: "EmptyLand" }),
      find: () => ({ burgs: [], count: 0 }),
    };
    const tool = createFindBurgsByStateTool(runtime);
    const result = await tool.execute({ state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 4, name: "EmptyLand" });
    expect(body.burgs).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findBurgsByStateTool with the expected schema", () => {
    expect(findBurgsByStateTool.name).toBe("find_burgs_by_state");
    expect(findBurgsByStateTool.input_schema.type).toBe("object");
    expect(findBurgsByStateTool.input_schema.required).toEqual(["state"]);
    expect(findBurgsByStateTool.input_schema.properties.state).toBeDefined();
    expect(findBurgsByStateTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_BURGS_BY_STATE_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_BY_STATE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindBurgsByStateRuntime integration -----

describe("defaultFindBurgsByStateRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a state via the default runtime", () => {
    expect(defaultFindBurgsByStateRuntime.resolveState("Altaria")).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("finds burgs via the default runtime for state 1", () => {
    const result = defaultFindBurgsByStateRuntime.find(
      1,
      DEFAULT_FIND_BURGS_BY_STATE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findBurgsByStateTool.execute({ state: "Valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindBurgsByStateRuntime.resolveState(1)).toBe("not-ready");
    expect(
      defaultFindBurgsByStateRuntime.find(1, DEFAULT_FIND_BURGS_BY_STATE_LIMIT),
    ).toBe("not-ready");
    const result = await findBurgsByStateTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
