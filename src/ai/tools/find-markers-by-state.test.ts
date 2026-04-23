import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindMarkersByStateTool,
  DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
  defaultFindMarkersByStateRuntime,
  type FindMarkersByStateResult,
  type FindMarkersByStateRuntime,
  findMarkersByStateInPack,
  findMarkersByStateTool,
  MAX_FIND_MARKERS_BY_STATE_LIMIT,
  type ResolveStateResult,
  resolveStateRefInPack,
} from "./find-markers-by-state";

interface FakePack {
  markers: Array<{
    i: number;
    type?: string;
    icon?: string;
    x?: number;
    y?: number;
    cell?: number;
    removed?: boolean;
  } | null>;
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
  return p as unknown as Parameters<typeof findMarkersByStateInPack>[0];
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals placeholder
  //   1: "Altaria" (with fullName)
  //   2: "Valorin"
  //   3: "Ghost" (removed)
  //
  // Cells (indices 10..17), cells.state[cellI] holds the state id.
  //   cell 10: state 1
  //   cell 11: state 1
  //   cell 12: state 2
  //   cell 13: state 1
  //   cell 14: state 2
  //   cell 15: state 0 (neutral)
  //   cell 16: state 1 (used by removed marker)
  //
  // Markers:
  //   0: placeholder (skipped)
  //   1: castle, cell 10, state 1
  //   2: castle, cell 11, state 1
  //   3: mine, cell 12, state 2
  //   4: battlefield, cell 13, state 1
  //   5: volcano, cell 14, state 2 (capital-like)
  //   6: shrine, cell 15, state 0 (neutrals)
  //   7: removed (cell 16, state 1) — skipped
  //   8: no cell — skipped
  //   9: cell 99 (out of bounds in cells.state) — skipped
  const cellState: Array<number | undefined> = [];
  cellState[10] = 1;
  cellState[11] = 1;
  cellState[12] = 2;
  cellState[13] = 1;
  cellState[14] = 2;
  cellState[15] = 0;
  cellState[16] = 1;

  return {
    markers: [
      { i: 0 },
      { i: 1, type: "castle", icon: "C", x: 100, y: 200, cell: 10 },
      { i: 2, type: "castle", icon: "C", x: 110, y: 210, cell: 11 },
      { i: 3, type: "mine", icon: "M", x: 300, y: 400, cell: 12 },
      {
        i: 4,
        type: "battlefield",
        icon: "B",
        x: 115,
        y: 220,
        cell: 13,
      },
      { i: 5, type: "volcano", icon: "V", x: 320, y: 410, cell: 14 },
      { i: 6, type: "shrine", icon: "S", x: 500, y: 500, cell: 15 },
      {
        i: 7,
        type: "castle",
        icon: "C",
        x: 0,
        y: 0,
        cell: 16,
        removed: true,
      },
      { i: 8, type: "orphan", icon: "O" },
      { i: 9, type: "wanderer", icon: "W", x: 0, y: 0, cell: 99 },
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Altaria", fullName: "Kingdom of Altaria" },
      { i: 2, name: "Valorin" },
      { i: 3, name: "Ghost", removed: true },
    ],
    cells: { state: cellState },
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveStateResult;
  find?: FindMarkersByStateResult;
}): FindMarkersByStateRuntime {
  return {
    resolveState: () => opts.resolve ?? { i: 1, name: "Altaria" },
    find: () => opts.find ?? { markers: [], count: 0 },
  };
}

function realRuntime(): FindMarkersByStateRuntime {
  const pack = asPack(makePack());
  return {
    resolveState: (ref) => resolveStateRefInPack(pack, ref),
    find: (stateI, limit) => findMarkersByStateInPack(pack, stateI, limit),
  };
}

describe("find_markers_by_state — pure scanner", () => {
  it("returns every active marker for a state with multiple markers", () => {
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    // state 1 markers: 1, 2, 4 (7 removed, 9 out-of-bounds)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("returns markers for a second state cleanly (no cross-contamination)", () => {
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids).toEqual(new Set([3, 5]));
    expect(result.count).toBe(2);
  });

  it("returns empty list when the state has no markers", () => {
    // state 3 (Ghost) — no cell points to it even if caller asks.
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: unknown[]; count: number };
    expect(result.markers).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed markers", () => {
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("skips markers without an integer cell", () => {
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids.has(8)).toBe(false);
  });

  it("skips markers whose cell is out-of-bounds in cells.state", () => {
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    // marker 9 has cell 99 which is undefined in cells.state — must not match
    expect(ids.has(9)).toBe(false);
  });

  it("truncates `markers` at limit but preserves full `count`", () => {
    const result = findMarkersByStateInPack(asPack(makePack()), 1, 2) as {
      markers: Array<{ i: number }>;
      count: number;
    };
    expect(result.markers.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates x, y, type, icon, cell from the raw marker", () => {
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as {
      markers: Array<{
        i: number;
        type: string | null;
        icon: string | null;
        x: number | null;
        y: number | null;
        cell: number;
      }>;
    };
    const byId = new Map(result.markers.map((m) => [m.i, m]));
    expect(byId.get(5)).toEqual({
      i: 5,
      type: "volcano",
      icon: "V",
      x: 320,
      y: 410,
      cell: 14,
    });
  });

  it("returns state 0 markers when queried explicitly by the scanner (bypassing tool guards)", () => {
    // The scanner itself doesn't reject state 0; the tool surface does.
    const result = findMarkersByStateInPack(
      asPack(makePack()),
      0,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids).toEqual(new Set([6]));
    expect(result.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findMarkersByStateInPack(
        undefined,
        1,
        DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.markers is missing", () => {
    const pack = {
      cells: { state: [] },
    } as unknown as Parameters<typeof findMarkersByStateInPack>[0];
    expect(
      findMarkersByStateInPack(pack, 1, DEFAULT_FIND_MARKERS_BY_STATE_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.state is missing", () => {
    const pack = {
      markers: [{ i: 0 }],
    } as unknown as Parameters<typeof findMarkersByStateInPack>[0];
    expect(
      findMarkersByStateInPack(pack, 1, DEFAULT_FIND_MARKERS_BY_STATE_LIMIT),
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

describe("find_markers_by_state — tool surface", () => {
  it("returns ok=true with resolved state, markers, and count (numeric)", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 1, name: "Altaria" });
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string state name (case-insensitive)", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: "valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("accepts fullName case-insensitively", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: "Kingdom Of Altaria" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state.i).toBe(1);
  });

  it("rejects state=0 with a Neutrals-specific error", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
  });

  it("rejects missing / invalid state", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
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
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("surfaces 'not-ready' from resolveState as a structured error", async () => {
    const tool = createFindMarkersByStateTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindMarkersByStateTool(
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
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no state found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
    const result = await tool.execute({ state: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.markers.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindMarkersByStateTool(realRuntime());
    for (const bad of [
      { state: 1, limit: 0 },
      { state: 1, limit: -1 },
      { state: 1, limit: 1.5 },
      { state: 1, limit: "10" },
      { state: 1, limit: MAX_FIND_MARKERS_BY_STATE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindMarkersByStateRuntime = {
      resolveState: () => ({ i: 1, name: "Altaria" }),
      find: (_stateI, limit) => {
        receivedLimit = limit;
        return { markers: [], count: 0 };
      },
    };
    const tool = createFindMarkersByStateTool(runtime);
    await tool.execute({ state: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_MARKERS_BY_STATE_LIMIT);
  });

  it("returns empty list when the state has no markers", async () => {
    const runtime: FindMarkersByStateRuntime = {
      resolveState: () => ({ i: 4, name: "EmptyLand" }),
      find: () => ({ markers: [], count: 0 }),
    };
    const tool = createFindMarkersByStateTool(runtime);
    const result = await tool.execute({ state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 4, name: "EmptyLand" });
    expect(body.markers).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findMarkersByStateTool with the expected schema", () => {
    expect(findMarkersByStateTool.name).toBe("find_markers_by_state");
    expect(findMarkersByStateTool.input_schema.type).toBe("object");
    expect(findMarkersByStateTool.input_schema.required).toEqual(["state"]);
    expect(findMarkersByStateTool.input_schema.properties.state).toBeDefined();
    expect(findMarkersByStateTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_MARKERS_BY_STATE_LIMIT).toBe(10000);
    expect(MAX_FIND_MARKERS_BY_STATE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindMarkersByStateRuntime integration -----

describe("defaultFindMarkersByStateRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a state via the default runtime", () => {
    expect(defaultFindMarkersByStateRuntime.resolveState("Altaria")).toEqual({
      i: 1,
      name: "Altaria",
    });
  });

  it("finds markers via the default runtime for state 1", () => {
    const result = defaultFindMarkersByStateRuntime.find(
      1,
      DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
    ) as { markers: Array<{ i: number }>; count: number };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findMarkersByStateTool.execute({ state: "Valorin" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ i: 2, name: "Valorin" });
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindMarkersByStateRuntime.resolveState(1)).toBe("not-ready");
    expect(
      defaultFindMarkersByStateRuntime.find(
        1,
        DEFAULT_FIND_MARKERS_BY_STATE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findMarkersByStateTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
