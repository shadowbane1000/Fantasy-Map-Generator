import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RawBurg,
  RawNote,
  RawProvince,
  RawRegiment,
  RawState,
} from "./_shared";
import {
  createRemoveStateTool,
  type RemoveStateRef,
  type RemoveStateResult,
  type RemoveStateRuntime,
  removeStateTool,
} from "./remove-state";

function makeRuntime(
  find: (ref: number | string) => RemoveStateRef | null,
  result: RemoveStateResult = {
    reassignedBurgs: 0,
    removedProvinces: 0,
    removedRegiments: 0,
    neighborsCleaned: 0,
  },
): {
  runtime: RemoveStateRuntime;
  remove: ReturnType<typeof vi.fn<RemoveStateRuntime["remove"]>>;
} {
  const remove = vi.fn<RemoveStateRuntime["remove"]>(() => result);
  return { runtime: { find, remove }, remove };
}

describe("remove_state tool", () => {
  it("removes by numeric id", async () => {
    const { runtime, remove } = makeRuntime(
      (ref) =>
        ref === 1
          ? {
              i: 1,
              name: "Altaria",
              fullName: "Kingdom of Altaria",
              provinces: [3, 4],
              military: [{ i: 1 } as RawRegiment],
            }
          : null,
      {
        reassignedBurgs: 2,
        removedProvinces: 2,
        removedRegiments: 1,
        neighborsCleaned: 1,
      },
    );
    const tool = createRemoveStateTool(runtime);
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Altaria",
      fullName: "Kingdom of Altaria",
      reassignedBurgs: 2,
      removedProvinces: 2,
      removedRegiments: 1,
      neighborsCleaned: 1,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn<RemoveStateRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "altaria"
        ? {
            i: 1,
            name: "Altaria",
            fullName: "Kingdom of Altaria",
            provinces: [],
            military: [],
          }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveStateTool(runtime);
    await tool.execute({ state: "ALTARIA" });
    expect(find).toHaveBeenCalledWith("ALTARIA");
    expect(remove).toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveStateTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects state id 0 (Neutrals)", async () => {
    const { runtime, remove } = makeRuntime(() => ({
      i: 0,
      name: "Neutrals",
      fullName: "",
      provinces: [],
      military: [],
    }));
    const tool = createRemoveStateTool(runtime);
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects unknown state", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveStateTool(runtime);
    const result = await tool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RemoveStateRuntime = {
      find: () => ({
        i: 1,
        name: "Altaria",
        fullName: "",
        provinces: [],
        military: [],
      }),
      remove: vi.fn(() => {
        throw new Error("pack.states is not available.");
      }),
    };
    const tool = createRemoveStateTool(runtime);
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/states/);
  });
});

describe("defaultRemoveStateRuntime (integration)", () => {
  const unfog = vi.fn();
  const drawStates = vi.fn();
  const drawBorders = vi.fn();
  const drawProvinces = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalUnfog = (globalThis as { unfog?: unknown }).unfog;
  const originalDrawStates = (globalThis as { drawStates?: unknown })
    .drawStates;
  const originalDrawBorders = (globalThis as { drawBorders?: unknown })
    .drawBorders;
  const originalDrawProvinces = (globalThis as { drawProvinces?: unknown })
    .drawProvinces;

  type FakeEl = {
    id: string;
    parent?: FakeEl;
    children: FakeEl[];
    appendChild(c: FakeEl): FakeEl;
    remove(): void;
    querySelector(sel: string): FakeEl | null;
  };
  function makeEl(id: string): FakeEl {
    return {
      id,
      children: [],
      appendChild(c) {
        c.parent = this;
        this.children.push(c);
        return c;
      },
      remove() {
        if (!this.parent) return;
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) this.parent.children.splice(idx, 1);
        this.parent = undefined;
      },
      querySelector() {
        return null;
      },
    };
  }

  let root: FakeEl;

  beforeEach(() => {
    unfog.mockReset();
    drawStates.mockReset();
    drawBorders.mockReset();
    drawProvinces.mockReset();

    root = makeEl("root");
    for (const id of [
      "state1",
      "state-gap1",
      "state-border1",
      "stateLabel1",
      "textPath_stateLabel1",
      "stateCOA1",
      "army1",
      "province3",
      "province-gap3",
      "provinceCOA3",
      "province4",
      "province-gap4",
      "provinceCOA4",
    ]) {
      root.appendChild(makeEl(id));
    }

    (globalThis as { pack?: unknown }).pack = {
      cells: {
        state: [0, 1, 2, 1, 2, 0],
        province: [0, 3, 4, 3, 4, 5],
      },
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Altaria",
          fullName: "Kingdom of Altaria",
          provinces: [3, 4],
          military: [{ i: 1, name: "1st Army" } as RawRegiment],
          neighbors: [2],
        },
        {
          i: 2,
          name: "Brighton",
          fullName: "Brighton",
          provinces: [5],
          military: [],
          neighbors: [1],
        },
      ] satisfies RawState[],
      provinces: [
        { i: 0 },
        { i: 1 },
        { i: 2 },
        { i: 3, name: "North", state: 1 },
        { i: 4, name: "South", state: 1 },
        { i: 5, name: "East", state: 2 },
      ] satisfies RawProvince[],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, capital: 1 },
        { i: 2, state: 1 },
        { i: 3, state: 2 },
        { i: 4, state: 1, removed: true },
      ] satisfies RawBurg[],
    };

    (globalThis as { notes?: unknown }).notes = [
      { id: "regiment1-1", name: "1st Army" },
      { id: "regiment2-1", name: "Other" },
    ] satisfies RawNote[];

    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        const stack: FakeEl[] = [root];
        while (stack.length) {
          const n = stack.pop();
          if (n?.id === id) return n;
          if (n) stack.push(...n.children);
        }
        return null;
      },
    };

    (globalThis as { unfog?: unknown }).unfog = unfog;
    (globalThis as { drawStates?: unknown }).drawStates = drawStates;
    (globalThis as { drawBorders?: unknown }).drawBorders = drawBorders;
    (globalThis as { drawProvinces?: unknown }).drawProvinces = drawProvinces;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { unfog?: unknown }).unfog = originalUnfog;
    (globalThis as { drawStates?: unknown }).drawStates = originalDrawStates;
    (globalThis as { drawBorders?: unknown }).drawBorders = originalDrawBorders;
    (globalThis as { drawProvinces?: unknown }).drawProvinces =
      originalDrawProvinces;
  });

  it("cascades burgs / cells / provinces / notes / neighbors and tombstones", async () => {
    const result = await removeStateTool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      i: 1,
      reassignedBurgs: 2,
      removedProvinces: 2,
      removedRegiments: 1,
      neighborsCleaned: 1,
    });

    const pack = (
      globalThis as unknown as {
        pack: {
          cells: { state: number[]; province: number[] };
          states: RawState[];
          provinces: RawProvince[];
          burgs: RawBurg[];
        };
      }
    ).pack;

    expect(pack.cells.state).toEqual([0, 0, 2, 0, 2, 0]);
    expect(pack.cells.province).toEqual([0, 0, 0, 0, 0, 5]);
    expect(pack.provinces[3]).toEqual({ i: 3, removed: true });
    expect(pack.provinces[4]).toEqual({ i: 4, removed: true });
    expect(pack.provinces[5]?.name).toBe("East");

    expect(pack.burgs[1]?.state).toBe(0);
    expect(pack.burgs[1]?.capital).toBe(0);
    expect(pack.burgs[2]?.state).toBe(0);
    expect(pack.burgs[3]?.state).toBe(2);
    expect(pack.burgs[4]?.state).toBe(1); // removed, untouched

    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes.find((n) => n.id === "regiment1-1")).toBeUndefined();
    expect(notes.find((n) => n.id === "regiment2-1")).toBeTruthy();

    expect(pack.states[2]?.neighbors).toEqual([]);
    expect(pack.states[1]).toEqual({ i: 1, removed: true });

    expect(unfog).toHaveBeenCalledWith("focusState1");
    expect(drawStates).toHaveBeenCalledTimes(1);
    expect(drawBorders).toHaveBeenCalledTimes(1);
    expect(drawProvinces).toHaveBeenCalledTimes(1);

    // DOM cleanup: state1, stateLabel1, army1, province3, province4.
    expect(root.children.find((c) => c.id === "state1")).toBeUndefined();
    expect(root.children.find((c) => c.id === "stateLabel1")).toBeUndefined();
    expect(root.children.find((c) => c.id === "army1")).toBeUndefined();
    expect(root.children.find((c) => c.id === "province3")).toBeUndefined();
    expect(root.children.find((c) => c.id === "province4")).toBeUndefined();
  });

  it("rejects state 0 (Neutrals)", async () => {
    const result = await removeStateTool.execute({ state: 0 });
    expect(result.isError).toBe(true);
  });

  it("rejects an already-removed state", async () => {
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    if (pack.states[1]) pack.states[1].removed = true;
    const result = await removeStateTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    await removeStateTool.execute({ state: "altaria" });
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[1]).toEqual({ i: 1, removed: true });
  });
});
