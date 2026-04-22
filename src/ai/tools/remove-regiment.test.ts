import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote, RawState } from "./_shared";
import {
  createRemoveRegimentTool,
  type RegimentRemovalRuntime,
  type RemoveRegimentRef,
  removeRegimentTool,
} from "./remove-regiment";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
  ) => RemoveRegimentRef | null,
): {
  runtime: RegimentRemovalRuntime;
  remove: ReturnType<typeof vi.fn<RegimentRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<RegimentRemovalRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_regiment tool", () => {
  it("removes by (state id, regiment id)", async () => {
    const { runtime, remove } = makeRuntime((sref, rref) =>
      sref === 1 && rref === 2
        ? { stateId: 1, stateName: "Rookhold", i: 2, name: "Phalanx" }
        : null,
    );
    const tool = createRemoveRegimentTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(1, 2);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Rookhold",
      i: 2,
      name: "Phalanx",
    });
  });

  it("removes by (state name, regiment name)", async () => {
    const find = vi.fn<RegimentRemovalRuntime["find"]>((sref, rref) =>
      typeof sref === "string" &&
      sref.toLowerCase() === "rookhold" &&
      typeof rref === "string" &&
      rref.toLowerCase() === "phalanx"
        ? { stateId: 1, stateName: "Rookhold", i: 2, name: "Phalanx" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveRegimentTool(runtime);
    await tool.execute({ state: "ROOKHOLD", regiment: "phalanx" });
    expect(find).toHaveBeenCalledWith("ROOKHOLD", "phalanx");
    expect(remove).toHaveBeenCalledWith(1, 2);
  });

  it("errors when the state/regiment pair is unknown", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRegimentTool(runtime);
    const result = await tool.execute({ state: 999, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 0 });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RegimentRemovalRuntime = {
      find: () => ({ stateId: 1, stateName: "x", i: 0, name: "reg" }),
      remove: vi.fn(() => {
        throw new Error("pack gone");
      }),
    };
    const tool = createRemoveRegimentTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack gone/);
  });
});

describe("defaultRegimentRemovalRuntime (integration)", () => {
  const removeFn = vi.fn();
  const getElementById = vi.fn((id: string) =>
    id === "regiment1-2" ? { remove: removeFn } : null,
  );
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    removeFn.mockReset();
    getElementById.mockClear();
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", removed: true },
        {
          i: 1,
          name: "Rookhold",
          military: [
            { i: 0, name: "1st Army" },
            { i: 2, name: "Phalanx" },
          ],
        },
      ] satisfies RawState[],
    };
    (globalThis as { notes?: unknown }).notes = [
      { id: "regiment1-2", name: "Phalanx note" },
    ] satisfies RawNote[];
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("splices regiment, drops matching note, removes SVG element", async () => {
    const result = await removeRegimentTool.execute({
      state: 1,
      regiment: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    const military = pack.states[1]?.military;
    expect(military).toHaveLength(1);
    expect(military?.[0]?.i).toBe(0);
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toHaveLength(0);
    expect(removeFn).toHaveBeenCalledTimes(1);
  });

  it("succeeds when no matching note exists", async () => {
    const result = await removeRegimentTool.execute({
      state: 1,
      regiment: 0,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.military).toHaveLength(1);
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toHaveLength(1); // regiment1-2 note untouched
  });

  it("succeeds when the SVG element is not mounted", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await removeRegimentTool.execute({
      state: 1,
      regiment: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.military).toHaveLength(1);
  });

  it("errors when the regiment does not exist", async () => {
    const result = await removeRegimentTool.execute({
      state: 1,
      regiment: 999,
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.military).toHaveLength(2);
  });
});
