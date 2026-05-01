import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRecalculateStatesTool,
  type RecalculateStatesRuntime,
  recalculateStatesTool,
} from "./recalculate-states";

interface RuntimeBundle {
  runtime: RecalculateStatesRuntime;
  snapshotState: ReturnType<typeof vi.fn<() => number[] | null>>;
  snapshotProvince: ReturnType<typeof vi.fn<() => number[] | null>>;
  recalculate: ReturnType<typeof vi.fn<() => void>>;
}

function makeRuntime(opts: {
  stateSnapshots?: Array<number[] | null>;
  provinceSnapshots?: Array<number[] | null>;
  recalculate?: () => void;
}): RuntimeBundle {
  const stateSeq = [...(opts.stateSnapshots ?? [])];
  const provinceSeq = [...(opts.provinceSnapshots ?? [])];
  const snapshotState = vi.fn<() => number[] | null>(() => {
    if (stateSeq.length === 0) {
      throw new Error("snapshotState called more times than sequence");
    }
    return stateSeq.shift() as number[] | null;
  });
  const snapshotProvince = vi.fn<() => number[] | null>(() => {
    if (provinceSeq.length === 0) {
      throw new Error("snapshotProvince called more times than sequence");
    }
    return provinceSeq.shift() as number[] | null;
  });
  const recalculate = vi.fn<() => void>(opts.recalculate);
  return {
    runtime: { snapshotState, snapshotProvince, recalculate },
    snapshotState,
    snapshotProvince,
    recalculate,
  };
}

describe("recalculate_states tool", () => {
  it("snapshots before recalc, computes cells_*_changed, calls recalculate once in order", async () => {
    const { runtime, snapshotState, snapshotProvince, recalculate } =
      makeRuntime({
        stateSnapshots: [
          [0, 0, 1, 1, 2, 2],
          [0, 1, 1, 2, 2, 2],
        ],
        provinceSnapshots: [
          [10, 10, 11, 11, 12, 12],
          [10, 10, 11, 12, 12, 12],
        ],
      });
    const tool = createRecalculateStatesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(snapshotState).toHaveBeenCalledTimes(2);
    expect(snapshotProvince).toHaveBeenCalledTimes(2);
    expect(recalculate).toHaveBeenCalledTimes(1);

    // Order: BOTH pre-snapshots before recalculate; BOTH post-snapshots after.
    const ss0 = snapshotState.mock.invocationCallOrder[0];
    const ss1 = snapshotState.mock.invocationCallOrder[1];
    const sp0 = snapshotProvince.mock.invocationCallOrder[0];
    const sp1 = snapshotProvince.mock.invocationCallOrder[1];
    const rc = recalculate.mock.invocationCallOrder[0];
    expect(ss0).toBeDefined();
    expect(ss1).toBeDefined();
    expect(sp0).toBeDefined();
    expect(sp1).toBeDefined();
    expect(rc).toBeDefined();
    expect(ss0 as number).toBeLessThan(rc as number);
    expect(sp0 as number).toBeLessThan(rc as number);
    expect(rc as number).toBeLessThan(ss1 as number);
    expect(rc as number).toBeLessThan(sp1 as number);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_state_changed: 2,
      cells_province_changed: 1,
      previous_state_distribution: { "0": 2, "1": 2, "2": 2 },
      state_distribution: { "0": 1, "1": 2, "2": 3 },
      previous_province_distribution: { "10": 2, "11": 2, "12": 2 },
      province_distribution: { "10": 2, "11": 1, "12": 3 },
    });
  });

  it("captures previous_*_distribution BEFORE recalc runs", async () => {
    // BEFORE state [0,0,1] → { "0":2, "1":1 }. AFTER [1,1,1] → { "1":3 }.
    // BEFORE province [5,5,6] → { "5":2, "6":1 }. AFTER [6,6,6] → { "6":3 }.
    // If implementation captured AFTER for previous_*, it would get
    // { "1":3 } / { "6":3 } — observably wrong.
    const { runtime } = makeRuntime({
      stateSnapshots: [
        [0, 0, 1],
        [1, 1, 1],
      ],
      provinceSnapshots: [
        [5, 5, 6],
        [6, 6, 6],
      ],
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous_state_distribution).toEqual({ "0": 2, "1": 1 });
    expect(parsed.state_distribution).toEqual({ "1": 3 });
    expect(parsed.previous_province_distribution).toEqual({ "5": 2, "6": 1 });
    expect(parsed.province_distribution).toEqual({ "6": 3 });
    expect(parsed.cells_state_changed).toBe(2);
    expect(parsed.cells_province_changed).toBe(2);
    // Belt-and-suspenders: prove the BEFORE and AFTER histograms differ.
    expect(parsed.previous_state_distribution).not.toEqual(
      parsed.state_distribution,
    );
    expect(parsed.previous_province_distribution).not.toEqual(
      parsed.province_distribution,
    );
  });

  it("returns cells_*_changed=0 when recalc didn't change anything", async () => {
    const { runtime, recalculate } = makeRuntime({
      stateSnapshots: [
        [0, 0, 1, 1],
        [0, 0, 1, 1],
      ],
      provinceSnapshots: [
        [5, 5, 6, 6],
        [5, 5, 6, 6],
      ],
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_state_changed: 0,
      cells_province_changed: 0,
      previous_state_distribution: { "0": 2, "1": 2 },
      state_distribution: { "0": 2, "1": 2 },
      previous_province_distribution: { "5": 2, "6": 2 },
      province_distribution: { "5": 2, "6": 2 },
    });
    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it("errors when snapshotState returns null (pack/cells/state missing)", async () => {
    const { runtime, recalculate } = makeRuntime({
      stateSnapshots: [null],
      // Even though province snapshot returns valid, the state error
      // should fire first.
      provinceSnapshots: [[5, 6]],
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("errors when snapshotProvince returns null (pack/cells/province missing)", async () => {
    const { runtime, recalculate } = makeRuntime({
      stateSnapshots: [[0, 1]],
      provinceSnapshots: [null],
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("surfaces a window.recalculateStates-missing error and skips post-snapshot", async () => {
    const { runtime, snapshotState, snapshotProvince } = makeRuntime({
      stateSnapshots: [[0, 1]],
      provinceSnapshots: [[5, 6]],
      recalculate: () => {
        throw new Error(
          "window.recalculateStates is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.recalculateStates is not available; the map hasn't finished loading.",
    );
    // Each snapshot called exactly once (pre only — sequence helper
    // would throw on a second call since we only seeded one entry).
    expect(snapshotState).toHaveBeenCalledTimes(1);
    expect(snapshotProvince).toHaveBeenCalledTimes(1);
  });

  it("surfaces an arbitrary recalculate runtime error", async () => {
    const { runtime } = makeRuntime({
      stateSnapshots: [[0, 1]],
      provinceSnapshots: [[5, 6]],
      recalculate: () => {
        throw new Error("boom");
      },
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
  });

  it("exposes the expected name + empty input schema and round-trips through the registry", () => {
    const { runtime } = makeRuntime({
      stateSnapshots: [],
      provinceSnapshots: [],
    });
    const tool = createRecalculateStatesTool(runtime);
    expect(tool.name).toBe("recalculate_states");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(recalculateStatesTool);
    expect(registry.list().map((t) => t.name)).toContain("recalculate_states");
  });

  it("ignores extraneous / nullish input", async () => {
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const { runtime } = makeRuntime({
        stateSnapshots: [
          [0, 1],
          [1, 1],
        ],
        provinceSnapshots: [
          [5, 6],
          [6, 6],
        ],
      });
      const tool = createRecalculateStatesTool(runtime);
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.cells_state_changed).toBe(1);
      expect(parsed.cells_province_changed).toBe(1);
    }
  });

  it("handles empty cells.state and cells.province with empty histograms", async () => {
    const { runtime } = makeRuntime({
      stateSnapshots: [[], []],
      provinceSnapshots: [[], []],
    });
    const tool = createRecalculateStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_state_changed: 0,
      cells_province_changed: 0,
      previous_state_distribution: {},
      state_distribution: {},
      previous_province_distribution: {},
      province_distribution: {},
    });
  });
});

describe("defaultRecalculateStatesRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRecalc = (globalThis as { recalculateStates?: unknown })
    .recalculateStates;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { recalculateStates?: unknown }).recalculateStates =
      undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { recalculateStates?: unknown }).recalculateStates =
      originalRecalc;
    vi.restoreAllMocks();
  });

  it("invokes window.recalculateStates(true) and reports diff for both cells.state and cells.province", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: {
        state: new Uint16Array([0, 0, 1, 1, 2]),
        province: new Uint16Array([10, 10, 11, 11, 12]),
      },
    };
    const recalc = vi.fn<(must: boolean) => void>(() => {
      const pack = (
        globalThis as {
          pack: { cells: { state: Uint16Array; province: Uint16Array } };
        }
      ).pack;
      pack.cells.state = new Uint16Array([0, 1, 1, 2, 2]);
      pack.cells.province = new Uint16Array([10, 10, 12, 12, 12]);
    });
    (globalThis as { recalculateStates?: unknown }).recalculateStates = recalc;

    const result = await recalculateStatesTool.execute({});
    expect(result.isError).toBeFalsy();

    expect(recalc).toHaveBeenCalledTimes(1);
    // Critically: must be called with true. The legacy fn early-returns
    // on must=false when statesAutoChange is unchecked.
    expect(recalc.mock.calls[0]?.[0]).toBe(true);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_state_changed: 2,
      cells_province_changed: 2,
      previous_state_distribution: { "0": 2, "1": 2, "2": 1 },
      state_distribution: { "0": 1, "1": 2, "2": 2 },
      previous_province_distribution: { "10": 2, "11": 2, "12": 1 },
      province_distribution: { "10": 2, "12": 3 },
    });
  });

  it("errors when window.recalculateStates global is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: {
        state: new Uint16Array([0, 1]),
        province: new Uint16Array([5, 6]),
      },
    };
    // recalculateStates intentionally undefined.

    const result = await recalculateStatesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.recalculateStates is not available; the map hasn't finished loading.",
    );
  });

  it("errors when pack is missing entirely", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await recalculateStatesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
  });

  it("errors when pack.cells.state is missing (province present)", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: {
        // state intentionally absent.
        province: new Uint16Array([5, 6]),
      },
    };
    const result = await recalculateStatesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
  });

  it("errors when pack.cells.province is missing (state present)", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: {
        state: new Uint16Array([0, 1]),
        // province intentionally absent.
      },
    };
    const result = await recalculateStatesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
  });
});
