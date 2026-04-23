import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RawBurg,
  RawNote,
  RawProvince,
  RawRegiment,
  RawState,
} from "./_shared";
import {
  createMergeStatesTool,
  type MergeStatesCounts,
  type MergeStatesRef,
  type MergeStatesRuntime,
  mergeStatesTool,
} from "./merge-states";

function makeRuntime(
  resolveImpl: (
    into: number | string,
    from: (number | string)[],
  ) => MergeStatesRef | string,
  counts: MergeStatesCounts = {
    mergedStates: 1,
    reassignedBurgs: 0,
    demotedCapitals: 0,
    reassignedProvinces: 0,
    reassignedRegiments: 0,
  },
): {
  runtime: MergeStatesRuntime;
  merge: ReturnType<typeof vi.fn<MergeStatesRuntime["merge"]>>;
  resolve: ReturnType<typeof vi.fn<MergeStatesRuntime["resolve"]>>;
} {
  const resolve = vi.fn<MergeStatesRuntime["resolve"]>(resolveImpl);
  const merge = vi.fn<MergeStatesRuntime["merge"]>(() => counts);
  return { runtime: { resolve, merge }, resolve, merge };
}

describe("merge_states tool", () => {
  it("happy path with a single from", async () => {
    const { runtime, merge } = makeRuntime(
      () => ({
        rulingStateId: 1,
        rulingStateName: "Altaria",
        fromIds: [2],
        fromNames: ["Brighton"],
      }),
      {
        mergedStates: 1,
        reassignedBurgs: 2,
        demotedCapitals: 1,
        reassignedProvinces: 1,
        reassignedRegiments: 3,
      },
    );
    const tool = createMergeStatesTool(runtime);
    const result = await tool.execute({ into: 1, from: [2] });
    expect(result.isError).toBeFalsy();
    expect(merge).toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      into: { i: 1, name: "Altaria" },
      from: [{ i: 2, name: "Brighton" }],
      mergedStates: 1,
      reassignedBurgs: 2,
      demotedCapitals: 1,
      reassignedProvinces: 1,
      reassignedRegiments: 3,
    });
  });

  it("happy path with multiple from entries", async () => {
    const { runtime, merge } = makeRuntime(() => ({
      rulingStateId: 1,
      rulingStateName: "Altaria",
      fromIds: [2, 3],
      fromNames: ["Brighton", "Caldera"],
    }));
    const tool = createMergeStatesTool(runtime);
    await tool.execute({ into: 1, from: [2, "Caldera"] });
    expect(merge).toHaveBeenCalled();
  });

  it("rejects empty from array", async () => {
    const { runtime, merge } = makeRuntime(() => "");
    const tool = createMergeStatesTool(runtime);
    const result = await tool.execute({ into: 1, from: [] });
    expect(result.isError).toBe(true);
    expect(merge).not.toHaveBeenCalled();
  });

  it("rejects non-array from", async () => {
    const { runtime, merge } = makeRuntime(() => "");
    const tool = createMergeStatesTool(runtime);
    const result = await tool.execute({ into: 1, from: "Brighton" });
    expect(result.isError).toBe(true);
    expect(merge).not.toHaveBeenCalled();
  });

  it("rejects invalid from entries", async () => {
    const { runtime, merge } = makeRuntime(() => "");
    const tool = createMergeStatesTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ into: 1, from: [bad] });
      expect(r.isError).toBe(true);
    }
    expect(merge).not.toHaveBeenCalled();
  });

  it("rejects invalid into ref", async () => {
    const { runtime, merge } = makeRuntime(() => "");
    const tool = createMergeStatesTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ into: bad, from: [2] });
      expect(r.isError).toBe(true);
    }
    expect(merge).not.toHaveBeenCalled();
  });

  it("surfaces resolve errors", async () => {
    const { runtime, merge } = makeRuntime(
      () => "from must not contain the ruling state.",
    );
    const tool = createMergeStatesTool(runtime);
    const result = await tool.execute({ into: 1, from: [1] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/ruling state/);
    expect(merge).not.toHaveBeenCalled();
  });

  it("surfaces merge runtime errors", async () => {
    const runtime: MergeStatesRuntime = {
      resolve: () => ({
        rulingStateId: 1,
        rulingStateName: "Altaria",
        fromIds: [2],
        fromNames: ["Brighton"],
      }),
      merge: vi.fn(() => {
        throw new Error("pack.states is not available.");
      }),
    };
    const tool = createMergeStatesTool(runtime);
    const result = await tool.execute({ into: 1, from: [2] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.states/);
  });
});

describe("defaultMergeStatesRuntime (integration)", () => {
  const unfog = vi.fn();
  const getPoles = vi.fn();
  const drawStates = vi.fn();
  const drawBorders = vi.fn();
  const drawProvinces = vi.fn();
  const drawStateLabels = vi.fn();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalUnfog = (globalThis as { unfog?: unknown }).unfog;
  const originalStates = (globalThis as { States?: unknown }).States;
  const originalDrawStates = (globalThis as { drawStates?: unknown })
    .drawStates;
  const originalDrawBorders = (globalThis as { drawBorders?: unknown })
    .drawBorders;
  const originalDrawProvinces = (globalThis as { drawProvinces?: unknown })
    .drawProvinces;
  const originalDrawStateLabels = (globalThis as { drawStateLabels?: unknown })
    .drawStateLabels;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    unfog.mockReset();
    getPoles.mockReset();
    drawStates.mockReset();
    drawBorders.mockReset();
    drawProvinces.mockReset();
    drawStateLabels.mockReset();

    (globalThis as { pack?: unknown }).pack = {
      cells: { state: [0, 1, 2, 1, 2, 0] },
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Altaria",
          military: [{ i: 1, name: "1st Altaria" }] satisfies RawRegiment[],
        },
        {
          i: 2,
          name: "Brighton",
          military: [{ i: 1, name: "Ramilies" }] satisfies RawRegiment[],
        },
      ] satisfies RawState[],
      burgs: [
        { i: 0 },
        { i: 1, name: "A-cap", state: 1, capital: 1 },
        { i: 2, name: "B-cap", state: 2, capital: 1 },
        { i: 3, name: "Other", state: 2 },
      ] satisfies RawBurg[],
      provinces: [
        { i: 0 },
        { i: 1, name: "North", state: 1 },
        { i: 2, name: "South", state: 2 },
      ] satisfies RawProvince[],
    };
    (globalThis as { notes?: unknown }).notes = [
      { id: "regiment1-1", name: "1st Altaria" },
      { id: "regiment2-1", name: "Ramilies" },
    ] satisfies RawNote[];

    (globalThis as { unfog?: unknown }).unfog = unfog;
    (globalThis as { States?: unknown }).States = { getPoles };
    (globalThis as { drawStates?: unknown }).drawStates = drawStates;
    (globalThis as { drawBorders?: unknown }).drawBorders = drawBorders;
    (globalThis as { drawProvinces?: unknown }).drawProvinces = drawProvinces;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      drawStateLabels;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
      querySelector: () => null,
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { unfog?: unknown }).unfog = originalUnfog;
    (globalThis as { States?: unknown }).States = originalStates;
    (globalThis as { drawStates?: unknown }).drawStates = originalDrawStates;
    (globalThis as { drawBorders?: unknown }).drawBorders = originalDrawBorders;
    (globalThis as { drawProvinces?: unknown }).drawProvinces =
      originalDrawProvinces;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      originalDrawStateLabels;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("merges state 2 into state 1", async () => {
    const result = await mergeStatesTool.execute({ into: 1, from: [2] });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.mergedStates).toBe(1);
    expect(body.reassignedBurgs).toBe(2);
    expect(body.demotedCapitals).toBe(1);
    expect(body.reassignedProvinces).toBe(1);
    expect(body.reassignedRegiments).toBe(1);

    const pack = (
      globalThis as unknown as {
        pack: {
          cells: { state: number[] };
          states: RawState[];
          burgs: RawBurg[];
          provinces: RawProvince[];
        };
      }
    ).pack;
    expect(pack.cells.state).toEqual([0, 1, 1, 1, 1, 0]);
    expect(pack.states[2]?.removed).toBe(true);
    expect(pack.states[1]?.military?.length).toBe(2);
    expect(pack.burgs[2]?.state).toBe(1);
    expect(pack.burgs[2]?.capital).toBe(0);
    expect(pack.burgs[3]?.state).toBe(1);
    expect(pack.provinces[2]?.state).toBe(1);

    const notes = (globalThis as { notes: RawNote[] }).notes;
    // regiment2-1 has been renamed to regiment1-{newIndex} (1, since
    // ruling state had 1 regiment before merge).
    expect(notes.find((n) => n.id === "regiment2-1")).toBeUndefined();
    expect(notes.find((n) => n.id === "regiment1-1")).toBeTruthy();
    // New note id for the moved regiment
    expect(notes.some((n) => n.id === "regiment1-1")).toBe(true);
    expect(
      notes.filter(
        (n) => typeof n.id === "string" && n.id.startsWith("regiment1-"),
      ).length,
    ).toBeGreaterThanOrEqual(2);

    expect(unfog).toHaveBeenCalledTimes(1);
    expect(drawStates).toHaveBeenCalledTimes(1);
    expect(drawBorders).toHaveBeenCalledTimes(1);
    expect(drawProvinces).toHaveBeenCalledTimes(1);
    expect(drawStateLabels).toHaveBeenCalledWith([1]);
  });

  it("rejects from = [ruling]", async () => {
    const result = await mergeStatesTool.execute({ into: 1, from: [1] });
    expect(result.isError).toBe(true);
  });

  it("rejects Neutrals as ruling", async () => {
    const result = await mergeStatesTool.execute({ into: 0, from: [2] });
    expect(result.isError).toBe(true);
  });

  it("rejects unknown state", async () => {
    const result = await mergeStatesTool.execute({ into: 1, from: [999] });
    expect(result.isError).toBe(true);
  });
});
