import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDisruptHeightmapTool,
  type DisruptHeightmapRuntime,
  defaultDisruptHeightmapRuntime,
  disruptHeightmapTool,
} from "./disrupt-heightmap";
import { ToolRegistry } from "./index";

interface MockState {
  current: number[];
  reassignments: number[][];
}

function makeRuntime(opts: {
  initial: number[];
  random?: () => number;
  clamp?: (v: number, min: number, max: number) => number;
  updateHeightmap?: () => void;
  getThrows?: Error;
  setThrows?: Error;
}) {
  const state: MockState = {
    current: [...opts.initial],
    reassignments: [],
  };
  const random = vi.fn(opts.random ?? (() => 0.5));
  const clamp =
    opts.clamp ??
    ((v: number, min: number, max: number) => Math.min(Math.max(v, min), max));
  const updateHeightmap = vi.fn(opts.updateHeightmap ?? (() => {}));
  const getGridHeights = vi.fn(() => {
    if (opts.getThrows) throw opts.getThrows;
    return state.current as unknown as number[] & {
      map: (
        fn: (h: number, i: number) => number,
      ) => number[] & { length: number };
    };
  });
  const setGridHeights = vi.fn((next: number[]) => {
    if (opts.setThrows) throw opts.setThrows;
    state.reassignments.push(next);
    state.current = next;
  });
  const runtime: DisruptHeightmapRuntime = {
    getGridHeights:
      getGridHeights as unknown as DisruptHeightmapRuntime["getGridHeights"],
    setGridHeights:
      setGridHeights as unknown as DisruptHeightmapRuntime["setGridHeights"],
    random,
    clamp,
    updateHeightmap,
  };
  return {
    runtime,
    random,
    updateHeightmap,
    getGridHeights,
    setGridHeights,
    state,
  };
}

describe("disrupt_heightmap tool (mocked runtime)", () => {
  it("happy path: deterministic random=0.5 → +0.5 to each land cell, water unchanged", async () => {
    // 5 land cells (h=20,30,40,50,60) + 3 water cells (h=0,5,14).
    // delta = 2.5 - 0.5*4 = 0.5
    const { runtime, random, updateHeightmap, state } = makeRuntime({
      initial: [20, 30, 40, 50, 60, 0, 5, 14],
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      land_cells: 5,
      water_cells: 3,
      min_delta: 0.5,
      max_delta: 0.5,
      mean_abs_delta: 0.5,
    });

    // Land cells got +0.5; water cells unchanged.
    expect(state.current).toEqual([20.5, 30.5, 40.5, 50.5, 60.5, 0, 5, 14]);

    // random was called once per LAND cell.
    expect(random).toHaveBeenCalledTimes(5);
    // best-effort redraw was attempted.
    expect(updateHeightmap).toHaveBeenCalledTimes(1);
  });

  it("water cells (h < 15) preserved exactly", async () => {
    const { runtime, state } = makeRuntime({
      initial: [0, 5, 14],
      random: () => 0,
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current).toEqual([0, 5, 14]);
    const body = JSON.parse(result.content);
    expect(body.land_cells).toBe(0);
    expect(body.water_cells).toBe(3);
    expect(body.min_delta).toBe(0);
    expect(body.max_delta).toBe(0);
    expect(body.mean_abs_delta).toBe(0);
  });

  it("clamp UPPER: cell h=99 + delta=2.5 → 101 → clamped to 100", async () => {
    const { runtime, state } = makeRuntime({
      initial: [99],
      random: () => 0, // delta = 2.5 - 0 = 2.5 → 99 + 2.5 = 101.5 → 100
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current).toEqual([100]);
    const body = JSON.parse(result.content);
    // delta = 100 - 99 = 1
    expect(body.min_delta).toBe(1);
    expect(body.max_delta).toBe(1);
  });

  it("clamp LOWER: cell h=15 + delta=-1.5 → 13.5 (clamps to [0,100], NOT [15,100])", async () => {
    // The legacy `lim` clamps to [0, 100], so a land cell can downcross
    // the water boundary. We mirror that exactly.
    const { runtime, state } = makeRuntime({
      initial: [15],
      random: () => 1, // delta = 2.5 - 1*4 = -1.5 → 15 + -1.5 = 13.5
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current).toEqual([13.5]);
    const body = JSON.parse(result.content);
    // The cell is BEFORE-classified as land, so it counts in deltas.
    expect(body.land_cells).toBe(1);
    expect(body.water_cells).toBe(0);
    expect(body.min_delta).toBe(-1.5);
    expect(body.max_delta).toBe(-1.5);
  });

  it("REASSIGNMENT identity: original ref untouched, grid.cells.h replaced", async () => {
    const original = [20, 30, 40];
    const originalRef = original;
    const { runtime, state, setGridHeights } = makeRuntime({
      initial: original,
      random: () => 0.5, // delta = +0.5
    });
    // Capture original ref via the getter on first call.
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    // setGridHeights was called with a NEW array.
    expect(setGridHeights).toHaveBeenCalledTimes(1);
    const newArr = setGridHeights.mock.calls[0]?.[0];
    expect(newArr).not.toBe(originalRef);
    expect(state.current).not.toBe(originalRef);

    // Original ref is untouched (the legacy `.map` does NOT mutate in place).
    expect(originalRef).toEqual([20, 30, 40]);
  });

  it("empty grid (h.length=0) → ok with zero stats", async () => {
    const { runtime, state, updateHeightmap } = makeRuntime({
      initial: [],
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current).toEqual([]);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      land_cells: 0,
      water_cells: 0,
      min_delta: 0,
      max_delta: 0,
      mean_abs_delta: 0,
    });
    expect(updateHeightmap).toHaveBeenCalledTimes(1);
  });

  it("all-water grid → ok with zero stats, no random calls", async () => {
    const { runtime, random } = makeRuntime({
      initial: [0, 5, 10, 14],
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      land_cells: 0,
      water_cells: 4,
      min_delta: 0,
      max_delta: 0,
      mean_abs_delta: 0,
    });
    expect(random).not.toHaveBeenCalled();
  });

  it("missing grid.cells.h → returns canonical error", async () => {
    const { runtime } = makeRuntime({
      initial: [],
      getThrows: new Error(
        "window.grid.cells.h is not available; the map hasn't finished loading.",
      ),
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toBe(
      "window.grid.cells.h is not available; the map hasn't finished loading.",
    );
  });

  it("updateHeightmap missing/no-op → no error", async () => {
    const { runtime, state } = makeRuntime({
      initial: [20, 30],
      updateHeightmap: () => {}, // no-op
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current.length).toBe(2);
  });

  it("updateHeightmap throws → still ok (best-effort)", async () => {
    const { runtime } = makeRuntime({
      initial: [20, 30],
      updateHeightmap: () => {
        throw new Error("redraw blew up");
      },
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    // Disrupt itself succeeded; renderer hiccup must not surface.
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
  });

  it("uses injected clamp end-to-end (verifies no direct lim/Math fallback)", async () => {
    // Custom clamp that always returns 42 — verifies the runtime injection
    // point is genuine.
    const { runtime, state } = makeRuntime({
      initial: [50, 60, 70],
      random: () => 0.5,
      clamp: (_v, _min, _max) => 42,
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current).toEqual([42, 42, 42]);
  });

  it("random injection: distinct random() values produce expected deltas", async () => {
    // h=[20, 20, 20]. Random values [0, 0.5, 1] → deltas [+2.5, +0.5, -1.5].
    const sequence = [0, 0.5, 1];
    let i = 0;
    const { runtime, state } = makeRuntime({
      initial: [20, 20, 20],
      random: () => sequence[i++] ?? 0,
    });
    const tool = createDisruptHeightmapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(state.current).toEqual([22.5, 20.5, 18.5]);
    const body = JSON.parse(result.content);
    expect(body.min_delta).toBe(-1.5);
    expect(body.max_delta).toBe(2.5);
    // mean |delta| = (2.5 + 0.5 + 1.5) / 3 = 1.5
    expect(body.mean_abs_delta).toBeCloseTo(1.5, 10);
  });

  it("is exported as disruptHeightmapTool with the expected shape", () => {
    expect(disruptHeightmapTool.name).toBe("disrupt_heightmap");
    expect(disruptHeightmapTool.input_schema.type).toBe("object");
    expect(disruptHeightmapTool.input_schema.properties).toEqual({});
    expect(disruptHeightmapTool.input_schema.required).toBeUndefined();
  });

  it("registers in a ToolRegistry and round-trips via run()", async () => {
    const registry = new ToolRegistry();
    registry.register(disruptHeightmapTool);
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("disrupt_heightmap");
    // Without a real grid, run() should return an error result (not throw).
    const result = await registry.run("disrupt_heightmap", {});
    expect(result.isError).toBe(true);
  });
});

describe("defaultDisruptHeightmapRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    grid?: unknown;
    lim?: unknown;
    updateHeightmap?: unknown;
  };
  const originalGrid = globalsRef.grid;
  const originalLim = globalsRef.lim;
  const originalUpdate = globalsRef.updateHeightmap;

  afterEach(() => {
    globalsRef.grid = originalGrid;
    globalsRef.lim = originalLim;
    globalsRef.updateHeightmap = originalUpdate;
  });

  it("getGridHeights throws when window.grid is missing", () => {
    globalsRef.grid = undefined;
    expect(() => defaultDisruptHeightmapRuntime.getGridHeights()).toThrow(
      /window\.grid\.cells\.h is not available/,
    );
  });

  it("getGridHeights throws when grid.cells.h is missing", () => {
    globalsRef.grid = { cells: {} } as unknown as object;
    expect(() => defaultDisruptHeightmapRuntime.getGridHeights()).toThrow(
      /window\.grid\.cells\.h is not available/,
    );
  });

  it("setGridHeights reassigns grid.cells.h to a new typed array", () => {
    const original = new Uint8Array([10, 20, 30, 40]);
    const cells = { h: original };
    globalsRef.grid = { cells } as unknown as object;

    const replacement = new Uint8Array([1, 2, 3, 4]);
    defaultDisruptHeightmapRuntime.setGridHeights(
      replacement as unknown as Parameters<
        typeof defaultDisruptHeightmapRuntime.setGridHeights
      >[0],
    );

    // grid.cells.h is now the replacement, NOT the original ref.
    expect(cells.h).toBe(replacement);
    expect(cells.h).not.toBe(original);
    // original is untouched.
    expect(Array.from(original)).toEqual([10, 20, 30, 40]);
  });

  it("clamp uses global lim when present", () => {
    let calls = 0;
    globalsRef.lim = (v: number) => {
      calls++;
      // Sentinel — return a value we can detect to prove the path is taken.
      return v + 1000;
    };
    const result = defaultDisruptHeightmapRuntime.clamp(42, 0, 100);
    expect(result).toBe(1042);
    expect(calls).toBe(1);
  });

  it("clamp falls back to local Math.min/max when lim is missing", () => {
    globalsRef.lim = undefined;
    expect(defaultDisruptHeightmapRuntime.clamp(150, 0, 100)).toBe(100);
    expect(defaultDisruptHeightmapRuntime.clamp(-50, 0, 100)).toBe(0);
    expect(defaultDisruptHeightmapRuntime.clamp(50, 0, 100)).toBe(50);
  });

  it("updateHeightmap is a no-op when global is missing", () => {
    globalsRef.updateHeightmap = undefined;
    expect(() =>
      defaultDisruptHeightmapRuntime.updateHeightmap(),
    ).not.toThrow();
  });

  it("updateHeightmap swallows throws", () => {
    globalsRef.updateHeightmap = () => {
      throw new Error("boom");
    };
    expect(() =>
      defaultDisruptHeightmapRuntime.updateHeightmap(),
    ).not.toThrow();
  });

  it("end-to-end: tool reassigns grid.cells.h (typed array) and original ref untouched", async () => {
    // 5 land cells + 3 water cells. Use a Uint8Array so we exercise the
    // typed-array `.map` path.
    const original = new Uint8Array([20, 30, 40, 50, 60, 0, 5, 14]);
    const cells = { h: original };
    globalsRef.grid = { cells } as unknown as object;
    globalsRef.lim = undefined;
    globalsRef.updateHeightmap = undefined;

    // Inject deterministic Math.random.
    const realRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const tool = createDisruptHeightmapTool();
      const result = await tool.execute({});
      expect(result.isError).toBeFalsy();
    } finally {
      Math.random = realRandom;
    }

    // grid.cells.h was REPLACED with a new Uint8Array.
    expect(cells.h).not.toBe(original);
    expect(cells.h).toBeInstanceOf(Uint8Array);
    expect(cells.h.length).toBe(8);

    // Original is unchanged.
    expect(Array.from(original)).toEqual([20, 30, 40, 50, 60, 0, 5, 14]);

    // Land cells: h+0.5 stored as Uint8 (truncated to int) → 20, 30, 40, ...
    // (20.5 → 20, 30.5 → 30, ...). Water cells unchanged.
    expect(Array.from(cells.h)).toEqual([20, 30, 40, 50, 60, 0, 5, 14]);
  });

  it("end-to-end: stats reflect BEFORE classification (downcrossing land cell still counted)", async () => {
    // Single land cell at h=15 + delta=-1.5 → 13.5 stored as 13.
    const original = new Uint8Array([15]);
    const cells = { h: original };
    globalsRef.grid = { cells } as unknown as object;
    globalsRef.lim = undefined;
    globalsRef.updateHeightmap = undefined;

    const realRandom = Math.random;
    Math.random = () => 1; // delta = -1.5
    try {
      const tool = createDisruptHeightmapTool();
      const result = await tool.execute({});
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      // Cell was BEFORE-classified as land (h=15 >= 15).
      expect(body.land_cells).toBe(1);
      expect(body.water_cells).toBe(0);
      // 13 - 15 = -2 (because 13.5 was truncated to 13 by Uint8Array storage).
      expect(body.min_delta).toBe(-2);
      expect(body.max_delta).toBe(-2);
      expect(body.mean_abs_delta).toBe(2);
    } finally {
      Math.random = realRandom;
    }

    expect(cells.h[0]).toBe(13);
  });

  it("end-to-end: falls back to local clamp when lim is missing (upper)", async () => {
    const original = new Uint8Array([99]);
    const cells = { h: original };
    globalsRef.grid = { cells } as unknown as object;
    globalsRef.lim = undefined;
    globalsRef.updateHeightmap = undefined;

    const realRandom = Math.random;
    Math.random = () => 0; // delta = 2.5
    try {
      const tool = createDisruptHeightmapTool();
      const result = await tool.execute({});
      expect(result.isError).toBeFalsy();
    } finally {
      Math.random = realRandom;
    }

    // 99 + 2.5 = 101.5 → clamped to 100 → stored as 100.
    expect(cells.h[0]).toBe(100);
  });
});
