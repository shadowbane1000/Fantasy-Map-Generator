import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRemoveMarkerTool,
  defaultMarkerRemovalRuntime,
  type MarkerRemovalRuntime,
  type RemoveMarkerRef,
} from "./remove-marker";

function makeRuntime(
  resolver: (ref: number | string) => RemoveMarkerRef | null,
) {
  const find = vi.fn(resolver);
  const remove = vi.fn<MarkerRemovalRuntime["remove"]>();
  const runtime: MarkerRemovalRuntime = { find, remove };
  return { runtime, find, remove };
}

describe("remove_marker tool", () => {
  it("removes a marker by numeric id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 3 ? { i: 3 } : null,
    );
    const tool = createRemoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 3 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(3);
    expect(JSON.parse(result.content)).toEqual({ ok: true, i: 3 });
  });

  it("resolves a name (case-insensitive) via the runtime", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? { i: 3 }
        : null,
    );
    const tool = createRemoveMarkerTool(runtime);
    await tool.execute({ marker: "ROOKHOLD" });
    expect(remove).toHaveBeenCalledWith(3);
  });

  it("errors on unknown marker", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({ i: 3 }));
    runtime.remove = vi.fn(() => {
      throw new Error("pack.markers is not available.");
    });
    const tool = createRemoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveMarkerTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      expect((await tool.execute({ marker: bad })).isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("defaultMarkerRemovalRuntime.remove", () => {
  let prevPack: unknown;
  let prevNotes: unknown;
  beforeEach(() => {
    prevPack = (globalThis as { pack?: unknown }).pack;
    prevNotes = (globalThis as { notes?: unknown }).notes;
  });
  afterEach(() => {
    if (prevPack === undefined) {
      delete (globalThis as { pack?: unknown }).pack;
    } else {
      (globalThis as { pack?: unknown }).pack = prevPack;
    }
    if (prevNotes === undefined) {
      delete (globalThis as { notes?: unknown }).notes;
    } else {
      (globalThis as { notes?: unknown }).notes = prevNotes;
    }
  });

  it("splices the marker + note in place and requires pack.markers", () => {
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 1, type: "castle" },
        { i: 3, type: "mine" },
        { i: 5, type: "cave" },
      ],
    };
    (globalThis as { notes?: unknown[] }).notes = [
      { id: "marker3", name: "Mine" },
      { id: "marker5", name: "Cave" },
    ];

    defaultMarkerRemovalRuntime.remove(3);

    const pack = (globalThis as { pack: { markers: Array<{ i: number }> } })
      .pack;
    const notes = (globalThis as { notes: Array<{ id: string }> }).notes;
    expect(pack.markers.map((m) => m.i)).toEqual([1, 5]);
    expect(notes.map((n) => n.id)).toEqual(["marker5"]);
  });

  it("throws when pack.markers is missing", () => {
    (globalThis as { pack?: unknown }).pack = {};
    expect(() => defaultMarkerRemovalRuntime.remove(1)).toThrow(
      /pack\.markers/,
    );
  });

  it("throws when the marker id isn't in pack.markers", () => {
    (globalThis as { pack?: unknown }).pack = {
      markers: [{ i: 1, type: "castle" }],
    };
    expect(() => defaultMarkerRemovalRuntime.remove(9)).toThrow(/Marker 9/);
  });
});
