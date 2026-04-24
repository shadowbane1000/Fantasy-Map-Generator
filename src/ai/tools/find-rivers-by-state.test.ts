import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindRiversByStateTool,
  DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
  defaultFindRiversByStateRuntime,
  type FindRiversByStateResult,
  type FindRiversByStateRuntime,
  findRiversByStateInPack,
  findRiversByStateTool,
  MAX_FIND_RIVERS_BY_STATE_LIMIT,
  type ResolveStateResult,
  resolveStateRefInPack,
} from "./find-rivers-by-state";

interface FakePack {
  rivers: Array<{
    i: number;
    name?: string;
    type?: string;
    source?: number;
    mouth?: number;
    length?: number;
    discharge?: number;
    removed?: boolean;
  }>;
  states: Array<{
    i: number;
    name?: string;
    fullName?: string;
    removed?: boolean;
  }>;
  cells: {
    state: Array<number | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findRiversByStateInPack>[0];
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals placeholder
  //   1: "Altaria" (with fullName)
  //   2: "Valorin"
  //   3: "Ghost" (removed)
  //
  // Cell-state indirection (index = cell id):
  //   cell 10 → state 1
  //   cell 11 → state 1
  //   cell 20 → state 2
  //   cell 21 → state 2
  //   cell 30 → state 0 (Neutrals)
  //   cell 31 → state 0
  //   cell 40 → undefined (no state)
  //
  // Rivers:
  //   0: placeholder
  //   1: source cell 10 (state 1), mouth cell 11 (state 1) — matches state 1
  //   2: source cell 20 (state 2), mouth cell 10 (state 1) — matches state 1 AND 2
  //   3: source cell 30 (state 0), mouth cell 31 (state 0) — matches only Neutrals
  //   4: source cell 20 (state 2), mouth cell 21 (state 2) — matches state 2
  //   5: removed, source 10, mouth 11 — should be skipped
  //   6: no source / mouth — should not match
  //   7: source cell 40 (undefined), mouth cell 40 (undefined)
  //   8: source cell 10 (state 1), mouth cell 20 (state 2) — matches state 1 AND 2
  const state: Array<number | undefined> = [];
  state[10] = 1;
  state[11] = 1;
  state[20] = 2;
  state[21] = 2;
  state[30] = 0;
  state[31] = 0;
  // cell 40 left undefined

  return {
    rivers: [
      { i: 0 },
      {
        i: 1,
        name: "Astralwater",
        type: "River",
        source: 10,
        mouth: 11,
        length: 20,
        discharge: 5,
      },
      {
        i: 2,
        name: "Borderflow",
        type: "River",
        source: 20,
        mouth: 10,
        length: 30,
        discharge: 8,
      },
      {
        i: 3,
        name: "Cloudrill",
        type: "Stream",
        source: 30,
        mouth: 31,
        length: 10,
        discharge: 2,
      },
      {
        i: 4,
        name: "Downflow",
        type: "River",
        source: 20,
        mouth: 21,
        length: 15,
        discharge: 4,
      },
      {
        i: 5,
        name: "Gone",
        source: 10,
        mouth: 11,
        removed: true,
      },
      { i: 6, name: "Orphan" },
      { i: 7, name: "LostStates", source: 40, mouth: 40 },
      {
        i: 8,
        name: "Cross",
        type: "River",
        source: 10,
        mouth: 20,
        length: 25,
        discharge: 6,
      },
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Altaria", fullName: "Kingdom of Altaria" },
      { i: 2, name: "Valorin" },
      { i: 3, name: "Ghost", removed: true },
    ],
    cells: { state },
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveStateResult;
  find?: FindRiversByStateResult;
}): FindRiversByStateRuntime {
  return {
    resolveState: () => opts.resolve ?? { i: 1, name: "Altaria" },
    find: () =>
      opts.find ?? {
        state: { i: 1, name: "Altaria" },
        rivers: [],
        count: 0,
      },
  };
}

function realRuntime(): FindRiversByStateRuntime {
  const pack = asPack(makePack());
  return {
    resolveState: (ref) => resolveStateRefInPack(pack, ref),
    find: (stateI, limit) => findRiversByStateInPack(pack, stateI, limit),
  };
}

describe("find_rivers_by_state — pure scanner", () => {
  it("matches rivers whose mouth cell or source cell is in the state", () => {
    const result = findRiversByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as { rivers: Array<{ i: number }>; count: number };
    const ids = new Set(result.rivers.map((r) => r.i));
    // state 1: rivers 1 (both), 2 (mouth), 8 (source)
    expect(ids).toEqual(new Set([1, 2, 8]));
    expect(result.count).toBe(3);
  });

  it("matches rivers for a second state cleanly (no cross-contamination)", () => {
    const result = findRiversByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as { rivers: Array<{ i: number }>; count: number };
    const ids = new Set(result.rivers.map((r) => r.i));
    // state 2: rivers 2 (source), 4 (both), 8 (mouth)
    expect(ids).toEqual(new Set([2, 4, 8]));
    expect(result.count).toBe(3);
  });

  it("returns empty list when the state has no rivers", () => {
    // state 99 never referenced by any cell
    const result = findRiversByStateInPack(
      asPack(makePack()),
      99,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as { rivers: unknown[]; count: number };
    expect(result.rivers).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed rivers", () => {
    const result = findRiversByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as { rivers: Array<{ i: number }>; count: number };
    const ids = new Set(result.rivers.map((r) => r.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(5)).toBe(false);
  });

  it("skips rivers without source / mouth endpoints", () => {
    const result = findRiversByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as { rivers: Array<{ i: number }>; count: number };
    const ids = new Set(result.rivers.map((r) => r.i));
    // river 6 has no source or mouth; river 7 points to undefined state
    expect(ids.has(6)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("truncates `rivers` at limit but preserves full `count`", () => {
    const result = findRiversByStateInPack(asPack(makePack()), 1, 2) as {
      rivers: Array<{ i: number }>;
      count: number;
    };
    expect(result.rivers.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates fields from the raw river", () => {
    const result = findRiversByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as {
      rivers: Array<{
        i: number;
        name: string;
        type: string | null;
        source: number;
        mouth: number;
        length: number;
        discharge: number;
      }>;
    };
    const byId = new Map(result.rivers.map((r) => [r.i, r]));
    expect(byId.get(4)).toEqual({
      i: 4,
      name: "Downflow",
      type: "River",
      source: 20,
      mouth: 21,
      length: 15,
      discharge: 4,
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findRiversByStateInPack(undefined, 1, DEFAULT_FIND_RIVERS_BY_STATE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.rivers is missing", () => {
    const pack = {
      cells: { state: [] },
    } as unknown as Parameters<typeof findRiversByStateInPack>[0];
    expect(
      findRiversByStateInPack(pack, 1, DEFAULT_FIND_RIVERS_BY_STATE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.state is missing", () => {
    const pack = {
      rivers: [],
    } as unknown as Parameters<typeof findRiversByStateInPack>[0];
    expect(
      findRiversByStateInPack(pack, 1, DEFAULT_FIND_RIVERS_BY_STATE_LIMIT),
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

describe("find_rivers_by_state — tool surface", () => {
  it("returns ok=true with resolved state, rivers, and count (numeric)", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 1, name: "Altaria" });
    expect(new Set(body.rivers.map((r: { i: number }) => r.i))).toEqual(
      new Set([1, 2, 8]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string state name (case-insensitive)", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: "valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.rivers.map((r: { i: number }) => r.i))).toEqual(
      new Set([2, 4, 8]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts fullName case-insensitively", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: "Kingdom Of Altaria" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state.i).toBe(1);
  });

  it("rejects state=0 with a Neutrals-specific error", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
  });

  it("rejects missing / invalid state", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
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
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("surfaces 'not-ready' from resolveState as a structured error", async () => {
    const tool = createFindRiversByStateTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindRiversByStateTool(
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
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
    const result = await tool.execute({ state: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.rivers.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindRiversByStateTool(realRuntime());
    for (const bad of [
      { state: 1, limit: 0 },
      { state: 1, limit: -1 },
      { state: 1, limit: 1.5 },
      { state: 1, limit: "10" },
      { state: 1, limit: MAX_FIND_RIVERS_BY_STATE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindRiversByStateRuntime = {
      resolveState: () => ({ i: 1, name: "Altaria" }),
      find: (_stateI, limit) => {
        receivedLimit = limit;
        return {
          state: { i: 1, name: "Altaria" },
          rivers: [],
          count: 0,
        };
      },
    };
    const tool = createFindRiversByStateTool(runtime);
    await tool.execute({ state: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_RIVERS_BY_STATE_LIMIT);
  });

  it("returns empty list when the state has no rivers", async () => {
    const runtime: FindRiversByStateRuntime = {
      resolveState: () => ({ i: 4, name: "EmptyLand" }),
      find: () => ({
        state: { i: 4, name: "EmptyLand" },
        rivers: [],
        count: 0,
      }),
    };
    const tool = createFindRiversByStateTool(runtime);
    const result = await tool.execute({ state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 4, name: "EmptyLand" });
    expect(body.rivers).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findRiversByStateTool with the expected schema", () => {
    expect(findRiversByStateTool.name).toBe("find_rivers_by_state");
    expect(findRiversByStateTool.input_schema.type).toBe("object");
    expect(findRiversByStateTool.input_schema.required).toEqual(["state"]);
    expect(findRiversByStateTool.input_schema.properties.state).toBeDefined();
    expect(findRiversByStateTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_RIVERS_BY_STATE_LIMIT).toBe(10000);
    expect(MAX_FIND_RIVERS_BY_STATE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindRiversByStateRuntime integration -----

describe("defaultFindRiversByStateRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a state via the default runtime", () => {
    expect(defaultFindRiversByStateRuntime.resolveState("Altaria")).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("finds rivers via the default runtime for state 1", () => {
    const result = defaultFindRiversByStateRuntime.find(
      1,
      DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
    ) as { rivers: Array<{ i: number }>; count: number };
    expect(new Set(result.rivers.map((r) => r.i))).toEqual(new Set([1, 2, 8]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findRiversByStateTool.execute({ state: "Valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.rivers.map((r: { i: number }) => r.i))).toEqual(
      new Set([2, 4, 8]),
    );
    expect(body.count).toBe(3);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindRiversByStateRuntime.resolveState(1)).toBe("not-ready");
    expect(
      defaultFindRiversByStateRuntime.find(
        1,
        DEFAULT_FIND_RIVERS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findRiversByStateTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
