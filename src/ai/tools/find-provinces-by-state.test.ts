import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindProvincesByStateTool,
  DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
  defaultFindProvincesByStateRuntime,
  type FindProvincesByStateResult,
  type FindProvincesByStateRuntime,
  findProvincesByStateInPack,
  findProvincesByStateTool,
  MAX_FIND_PROVINCES_BY_STATE_LIMIT,
  type ResolveStateResult,
  resolveStateRefInPack,
} from "./find-provinces-by-state";

interface FakePack {
  provinces: Array<{
    i: number;
    name?: string;
    fullName?: string;
    formName?: string;
    color?: string;
    state?: number;
    pole?: [number, number] | number[];
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
  return p as unknown as Parameters<typeof findProvincesByStateInPack>[0];
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals placeholder
  //   1: "Altaria" (with fullName)
  //   2: "Valorin"
  //   3: "Ghost" (removed)
  //
  // Provinces:
  //   0: placeholder
  //   1: Stormshore in state 1 (full record)
  //   2: Birchwell in state 1 (no fullName / formName / color)
  //   3: Coldreach in state 2
  //   4: Dusktown in state 1 (pole as number[])
  //   5: Emberkeep in state 2
  //   6: Freehold in neutrals (state 0)
  //   7: Gone, state 1 — removed (should be skipped)
  //   8: Orphan — no state field
  return {
    provinces: [
      { i: 0 },
      {
        i: 1,
        name: "Stormshore",
        fullName: "Duchy of Stormshore",
        formName: "Duchy",
        color: "#aa3322",
        state: 1,
        pole: [100, 200],
      },
      {
        i: 2,
        name: "Birchwell",
        state: 1,
        pole: [110, 210],
      },
      {
        i: 3,
        name: "Coldreach",
        fullName: "County of Coldreach",
        formName: "County",
        color: "#3344aa",
        state: 2,
        pole: [300, 400],
      },
      {
        i: 4,
        name: "Dusktown",
        fullName: "March of Dusktown",
        formName: "March",
        color: "#225577",
        state: 1,
        pole: [115, 220],
      },
      {
        i: 5,
        name: "Emberkeep",
        fullName: "Ember Keep",
        formName: "Keep",
        color: "#772211",
        state: 2,
        // no pole → center should be null
      },
      {
        i: 6,
        name: "Freehold",
        state: 0,
        pole: [500, 500],
      },
      {
        i: 7,
        name: "Gone",
        state: 1,
        pole: [0, 0],
        removed: true,
      },
      { i: 8, name: "Orphan" },
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
  find?: FindProvincesByStateResult;
}): FindProvincesByStateRuntime {
  return {
    resolveState: () => opts.resolve ?? { i: 1, name: "Altaria" },
    find: () => opts.find ?? { provinces: [], count: 0 },
  };
}

function realRuntime(): FindProvincesByStateRuntime {
  const pack = asPack(makePack());
  return {
    resolveState: (ref) => resolveStateRefInPack(pack, ref),
    find: (stateI, limit) => findProvincesByStateInPack(pack, stateI, limit),
  };
}

describe("find_provinces_by_state — pure scanner", () => {
  it("returns every active province for a state with multiple provinces", () => {
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as {
      provinces: Array<{
        i: number;
        name: string;
        fullName: string | null;
        formName: string | null;
        color: string | null;
        center: [number, number] | null;
      }>;
      count: number;
    };
    const ids = new Set(result.provinces.map((p) => p.i));
    // state 1 provinces: 1, 2, 4 (7 is removed)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("returns provinces for a second state cleanly (no cross-contamination)", () => {
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as { provinces: Array<{ i: number }>; count: number };
    const ids = new Set(result.provinces.map((p) => p.i));
    expect(ids).toEqual(new Set([3, 5]));
    expect(result.count).toBe(2);
  });

  it("returns empty list when the state has no provinces", () => {
    // state 3 (Ghost) exists in fixture but no province points to it.
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as { provinces: unknown[]; count: number };
    expect(result.provinces).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed provinces", () => {
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as { provinces: Array<{ i: number }>; count: number };
    const ids = new Set(result.provinces.map((p) => p.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("truncates `provinces` at limit but preserves full `count`", () => {
    const result = findProvincesByStateInPack(asPack(makePack()), 1, 2) as {
      provinces: Array<{ i: number }>;
      count: number;
    };
    expect(result.provinces.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates name, fullName, formName, color, center from the raw province", () => {
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as {
      provinces: Array<{
        i: number;
        name: string;
        fullName: string | null;
        formName: string | null;
        color: string | null;
        center: [number, number] | null;
      }>;
    };
    const byId = new Map(result.provinces.map((p) => [p.i, p]));
    expect(byId.get(3)).toEqual({
      i: 3,
      name: "Coldreach",
      fullName: "County of Coldreach",
      formName: "County",
      color: "#3344aa",
      center: [300, 400],
    });
  });

  it("falls back to null for missing fullName / formName / color / pole", () => {
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as {
      provinces: Array<{
        i: number;
        fullName: string | null;
        formName: string | null;
        color: string | null;
        center: [number, number] | null;
      }>;
    };
    const byId = new Map(result.provinces.map((p) => [p.i, p]));
    const row = byId.get(2);
    expect(row?.fullName).toBeNull();
    expect(row?.formName).toBeNull();
    expect(row?.color).toBeNull();
    expect(row?.center).toEqual([110, 210]);
  });

  it("returns center=null for provinces without a pole", () => {
    const result = findProvincesByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as {
      provinces: Array<{ i: number; center: [number, number] | null }>;
    };
    const byId = new Map(result.provinces.map((p) => [p.i, p]));
    expect(byId.get(5)?.center).toBeNull();
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findProvincesByStateInPack(
        undefined,
        1,
        DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.provinces is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findProvincesByStateInPack
    >[0];
    expect(
      findProvincesByStateInPack(
        pack,
        1,
        DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("resolveStateRefInPack (find_provinces_by_state)", () => {
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

describe("find_provinces_by_state — tool surface", () => {
  it("returns ok=true with resolved state, provinces, and count (numeric)", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 1, name: "Altaria" });
    expect(new Set(body.provinces.map((p: { i: number }) => p.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string state name (case-insensitive)", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: "valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.provinces.map((p: { i: number }) => p.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("accepts fullName case-insensitively", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: "Kingdom Of Altaria" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state.i).toBe(1);
  });

  it("rejects state=0 with a Neutrals-specific error", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
  });

  it("rejects missing / invalid state", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
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
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("surfaces 'not-ready' from resolveState as a structured error", async () => {
    const tool = createFindProvincesByStateTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindProvincesByStateTool(
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
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
    const result = await tool.execute({ state: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.provinces.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindProvincesByStateTool(realRuntime());
    for (const bad of [
      { state: 1, limit: 0 },
      { state: 1, limit: -1 },
      { state: 1, limit: 1.5 },
      { state: 1, limit: "10" },
      { state: 1, limit: MAX_FIND_PROVINCES_BY_STATE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindProvincesByStateRuntime = {
      resolveState: () => ({ i: 1, name: "Altaria" }),
      find: (_stateI, limit) => {
        receivedLimit = limit;
        return { provinces: [], count: 0 };
      },
    };
    const tool = createFindProvincesByStateTool(runtime);
    await tool.execute({ state: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT);
  });

  it("returns empty list when the state has no provinces", async () => {
    const runtime: FindProvincesByStateRuntime = {
      resolveState: () => ({ i: 4, name: "EmptyLand" }),
      find: () => ({ provinces: [], count: 0 }),
    };
    const tool = createFindProvincesByStateTool(runtime);
    const result = await tool.execute({ state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 4, name: "EmptyLand" });
    expect(body.provinces).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findProvincesByStateTool with the expected schema", () => {
    expect(findProvincesByStateTool.name).toBe("find_provinces_by_state");
    expect(findProvincesByStateTool.input_schema.type).toBe("object");
    expect(findProvincesByStateTool.input_schema.required).toEqual(["state"]);
    expect(
      findProvincesByStateTool.input_schema.properties.state,
    ).toBeDefined();
    expect(
      findProvincesByStateTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT).toBe(10000);
    expect(MAX_FIND_PROVINCES_BY_STATE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindProvincesByStateRuntime integration -----

describe("defaultFindProvincesByStateRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a state via the default runtime", () => {
    expect(defaultFindProvincesByStateRuntime.resolveState("Altaria")).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("finds provinces via the default runtime for state 1", () => {
    const result = defaultFindProvincesByStateRuntime.find(
      1,
      DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
    ) as { provinces: Array<{ i: number }>; count: number };
    expect(new Set(result.provinces.map((p) => p.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findProvincesByStateTool.execute({ state: "Valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.provinces.map((p: { i: number }) => p.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindProvincesByStateRuntime.resolveState(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindProvincesByStateRuntime.find(
        1,
        DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findProvincesByStateTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
