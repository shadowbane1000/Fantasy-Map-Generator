import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRandomizeStatesExpansionTool,
  type RandomizeStatesExpansionRuntime,
  randomizeStatesExpansionTool,
} from "./randomize-states-expansion";

interface RuntimeBundle {
  runtime: RandomizeStatesExpansionRuntime;
  randomExpansionism: ReturnType<typeof vi.fn<() => number>>;
  getStates: ReturnType<typeof vi.fn<() => RawState[] | undefined>>;
  recalculate: ReturnType<typeof vi.fn<() => void>>;
}

function makeRuntime(opts: {
  states?: RawState[] | undefined;
  randomSequence?: number[];
  recalculate?: () => void;
}): RuntimeBundle {
  const sequence = [...(opts.randomSequence ?? [])];
  const randomExpansionism = vi.fn<() => number>(() => {
    if (sequence.length === 0) {
      throw new Error("randomExpansionism called more times than sequence");
    }
    return sequence.shift() as number;
  });
  const getStates = vi.fn<() => RawState[] | undefined>(() => opts.states);
  const recalculate = vi.fn<() => void>(opts.recalculate);
  return {
    runtime: { randomExpansionism, getStates, recalculate },
    randomExpansionism,
    getStates,
    recalculate,
  };
}

describe("randomize_states_expansion tool", () => {
  it("randomizes every active state, captures previous, calls recalculate after", async () => {
    const states: RawState[] = [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "A", expansionism: 1.0 },
      { i: 2, name: "B", expansionism: 2.5 },
      { i: 3, name: "Gone", removed: true, expansionism: 4.2 },
      { i: 4, name: "NoExp" },
      { i: 5, name: "C", expansionism: 3.0 },
    ];
    const { runtime, randomExpansionism, recalculate } = makeRuntime({
      states,
      randomSequence: [3.4, 1.7, 9.2, 4.0],
    });
    const tool = createRandomizeStatesExpansionTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(randomExpansionism).toHaveBeenCalledTimes(4);
    expect(recalculate).toHaveBeenCalledTimes(1);

    // recalculate runs strictly after the LAST random call.
    const lastRandomOrder =
      randomExpansionism.mock.invocationCallOrder[
        randomExpansionism.mock.invocationCallOrder.length - 1
      ];
    const recalcOrder = recalculate.mock.invocationCallOrder[0];
    expect(lastRandomOrder).toBeDefined();
    expect(recalcOrder).toBeDefined();
    expect(lastRandomOrder as number).toBeLessThan(recalcOrder as number);

    // State 0 not mutated; state 3 (removed) preserved.
    expect(states[0]?.expansionism).toBeUndefined();
    expect(states[3]?.expansionism).toBe(4.2);

    // Active states mutated in-place to the sequence values.
    expect(states[1]?.expansionism).toBe(3.4);
    expect(states[2]?.expansionism).toBe(1.7);
    expect(states[4]?.expansionism).toBe(9.2);
    expect(states[5]?.expansionism).toBe(4.0);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      changes: [
        { i: 1, name: "A", previous: 1.0, expansionism: 3.4 },
        { i: 2, name: "B", previous: 2.5, expansionism: 1.7 },
        { i: 4, name: "NoExp", previous: 1, expansionism: 9.2 },
        { i: 5, name: "C", previous: 3.0, expansionism: 4.0 },
      ],
    });
  });

  it("captures previous BEFORE mutating each state", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, name: "A", expansionism: 1.0 },
      { i: 2, name: "B", expansionism: 2.5 },
      { i: 3, name: "C", expansionism: 3.0 },
    ];
    const seenWhenCalled: number[] = [];
    let cursor = 0;
    const activeOrder = [1, 2, 3];
    const newValues = [9.1, 9.2, 9.3];
    const randomExpansionism = vi.fn<() => number>(() => {
      const stateId = activeOrder[cursor];
      if (stateId === undefined) throw new Error("over-called");
      const s = states[stateId];
      if (!s) throw new Error("state missing");
      // Snapshot the CURRENT value of the state being processed.
      seenWhenCalled.push(s.expansionism as number);
      const next = newValues[cursor];
      cursor++;
      if (next === undefined) throw new Error("no next");
      return next;
    });
    const runtime: RandomizeStatesExpansionRuntime = {
      randomExpansionism,
      getStates: () => states,
      recalculate: () => {},
    };
    const tool = createRandomizeStatesExpansionTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    // Load-bearing: each peek saw the ORIGINAL value, not the new one.
    expect(seenWhenCalled).toEqual([1.0, 2.5, 3.0]);
  });

  it("returns ok with empty changes and does not call recalculate when no active states", async () => {
    const { runtime, randomExpansionism, recalculate } = makeRuntime({
      states: [{ i: 0 }, { i: 1, removed: true, expansionism: 5 }],
    });
    const tool = createRandomizeStatesExpansionTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, changes: [] });
    expect(randomExpansionism).not.toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("errors when pack.states is unavailable", async () => {
    const { runtime, randomExpansionism, recalculate } = makeRuntime({
      states: undefined,
    });
    const tool = createRandomizeStatesExpansionTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.states is not available; the map hasn't finished loading.",
    );
    expect(randomExpansionism).not.toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("surfaces a recalculate-missing error and leaves mutations in place", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, name: "A", expansionism: 1.0 },
    ];
    const { runtime, recalculate } = makeRuntime({
      states,
      randomSequence: [3.5],
      recalculate: () => {
        throw new Error("window.recalculateStates is not available.");
      },
    });
    const tool = createRandomizeStatesExpansionTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.recalculateStates is not available.",
    );
    // No rollback: mutation persists.
    expect(states[1]?.expansionism).toBe(3.5);
    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it("surfaces an arbitrary recalculate runtime error and leaves mutations in place", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, name: "A", expansionism: 1.0 },
    ];
    const { runtime } = makeRuntime({
      states,
      randomSequence: [4.4],
      recalculate: () => {
        throw new Error("boom");
      },
    });
    const tool = createRandomizeStatesExpansionTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
    expect(states[1]?.expansionism).toBe(4.4);
  });

  it("exposes the expected name + empty input schema and round-trips through the registry", () => {
    const { runtime } = makeRuntime({ states: [] });
    const tool = createRandomizeStatesExpansionTool(runtime);
    expect(tool.name).toBe("randomize_states_expansion");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(randomizeStatesExpansionTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "randomize_states_expansion",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, name: "A", expansionism: 1.0 },
    ];
    const { runtime, randomExpansionism, recalculate } = makeRuntime({
      states,
      randomSequence: [1, 2, 3, 4],
    });
    const tool = createRandomizeStatesExpansionTool(runtime);
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
    }
    expect(randomExpansionism).toHaveBeenCalledTimes(4);
    expect(recalculate).toHaveBeenCalledTimes(4);
  });

  it("returns changes sorted by id ascending regardless of pack order", async () => {
    // getStates is mocked, so we can return an out-of-order array.
    const states: RawState[] = [
      { i: 0 },
      { i: 5, name: "e", expansionism: 1 },
      { i: 2, name: "b", expansionism: 1 },
      { i: 7, name: "g", expansionism: 1 },
      { i: 1, name: "a", expansionism: 1 },
    ];
    const { runtime } = makeRuntime({
      states,
      // Iteration order is [5, 2, 7, 1] → assignments 5.5, 2.2, 7.7, 1.1.
      randomSequence: [5.5, 2.2, 7.7, 1.1],
    });
    const tool = createRandomizeStatesExpansionTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      changes: [
        { i: 1, name: "a", previous: 1, expansionism: 1.1 },
        { i: 2, name: "b", previous: 1, expansionism: 2.2 },
        { i: 5, name: "e", previous: 1, expansionism: 5.5 },
        { i: 7, name: "g", previous: 1, expansionism: 7.7 },
      ],
    });
    // Re-verify by id via lookup since the pack array is intentionally out
    // of order (this is a defensive sort test, not a real-pack-shape test).
    const byId = new Map(states.map((s) => [s.i, s.expansionism]));
    expect(byId.get(1)).toBe(1.1);
    expect(byId.get(2)).toBe(2.2);
    expect(byId.get(5)).toBe(5.5);
    expect(byId.get(7)).toBe(7.7);
  });
});

describe("defaultRandomizeStatesExpansionRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRecalc = (globalThis as { recalculateStates?: unknown })
    .recalculateStates;
  const originalRn = (globalThis as { rn?: unknown }).rn;

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { recalculateStates?: unknown }).recalculateStates =
      originalRecalc;
    (globalThis as { rn?: unknown }).rn = originalRn;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { recalculateStates?: unknown }).recalculateStates =
      undefined;
    (globalThis as { rn?: unknown }).rn = undefined;
  });

  it("randomizes pack.states using globalThis.rn and calls recalculateStates(true, true)", async () => {
    (globalThis as { rn?: unknown }).rn = (n: number, p: number) =>
      Math.round(n * 10 ** p) / 10 ** p;
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const recalc = vi.fn<(must: boolean, randomize: boolean) => void>();
    (globalThis as { recalculateStates?: unknown }).recalculateStates = recalc;
    const states: RawState[] = [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "A", expansionism: 1.0 },
      { i: 2, name: "B", expansionism: 2.5 },
    ];
    (globalThis as { pack?: unknown }).pack = { states };

    const result = await randomizeStatesExpansionTool.execute({});
    expect(result.isError).toBeFalsy();

    // rn(0.25*4 + 1, 1) = rn(2, 1) = 2.0
    expect(states[1]?.expansionism).toBe(2.0);
    expect(states[2]?.expansionism).toBe(2.0);

    expect(recalc).toHaveBeenCalledTimes(1);
    expect(recalc).toHaveBeenCalledWith(true, true);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      changes: [
        { i: 1, name: "A", previous: 1.0, expansionism: 2.0 },
        { i: 2, name: "B", previous: 2.5, expansionism: 2.0 },
      ],
    });
  });

  it("falls back to manual rounding when globalThis.rn is missing", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const recalc = vi.fn<(must: boolean, randomize: boolean) => void>();
    (globalThis as { recalculateStates?: unknown }).recalculateStates = recalc;
    const states: RawState[] = [
      { i: 0 },
      { i: 1, name: "A", expansionism: 1.0 },
    ];
    (globalThis as { pack?: unknown }).pack = { states };

    const result = await randomizeStatesExpansionTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(states[1]?.expansionism).toBe(2.0);
    expect(recalc).toHaveBeenCalledWith(true, true);
  });

  it("errors when globalThis.recalculateStates is missing; mutations persist", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const states: RawState[] = [
      { i: 0 },
      { i: 1, name: "A", expansionism: 1.0 },
    ];
    (globalThis as { pack?: unknown }).pack = { states };
    // recalculateStates intentionally undefined.

    const result = await randomizeStatesExpansionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.recalculateStates is not available.",
    );
    // Documented limitation: mutation already happened, no rollback.
    expect(states[1]?.expansionism).toBe(2.0);
  });

  it("errors when pack is missing entirely", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await randomizeStatesExpansionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.states is not available; the map hasn't finished loading.",
    );
  });
});
