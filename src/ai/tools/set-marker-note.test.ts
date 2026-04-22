import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetMarkerNoteTool,
  defaultMarkerNoteRuntime,
  findMarkerNoteRef,
  type MarkerNoteRef,
  type MarkerNoteRuntime,
} from "./set-marker-note";

function makeRuntime(resolver: (ref: number | string) => MarkerNoteRef | null) {
  const find = vi.fn(resolver);
  const setNote = vi.fn<MarkerNoteRuntime["setNote"]>();
  const runtime: MarkerNoteRuntime = { find, setNote };
  return { runtime, find, setNote };
}

describe("set_marker_note tool", () => {
  it("renames by numeric id without touching legend", async () => {
    const { runtime, setNote } = makeRuntime((ref) =>
      ref === 5
        ? { i: 5, previousName: "Rookhold", previousLegend: "Old lore" }
        : null,
    );
    const tool = createSetMarkerNoteTool(runtime);
    const result = await tool.execute({ marker: 5, name: "Dragon's Keep" });
    expect(result.isError).toBeFalsy();
    expect(setNote).toHaveBeenCalledWith(5, "Dragon's Keep", undefined);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Rookhold",
      previousLegend: "Old lore",
      name: "Dragon's Keep",
      legend: "Old lore",
    });
  });

  it("updates both name and legend when provided", async () => {
    const { runtime, setNote } = makeRuntime(() => ({
      i: 5,
      previousName: "Rookhold",
      previousLegend: "Old",
    }));
    const tool = createSetMarkerNoteTool(runtime);
    const result = await tool.execute({
      marker: 5,
      name: "Dragon's Keep",
      legend: "Seat of the red king.",
    });
    expect(setNote).toHaveBeenCalledWith(
      5,
      "Dragon's Keep",
      "Seat of the red king.",
    );
    expect(JSON.parse(result.content).legend).toBe("Seat of the red king.");
  });

  it("resolves by current note name (case-insensitive)", async () => {
    const { runtime, setNote } = makeRuntime((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? { i: 5, previousName: "Rookhold", previousLegend: null }
        : null,
    );
    const tool = createSetMarkerNoteTool(runtime);
    await tool.execute({ marker: "ROOKHOLD", name: "Dragon's Keep" });
    expect(setNote).toHaveBeenCalledWith(5, "Dragon's Keep", undefined);
  });

  it("rejects empty / whitespace name", async () => {
    const { runtime, setNote } = makeRuntime(() => ({
      i: 5,
      previousName: null,
      previousLegend: null,
    }));
    const tool = createSetMarkerNoteTool(runtime);
    for (const bad of ["", "   "]) {
      expect((await tool.execute({ marker: 5, name: bad })).isError).toBe(true);
    }
    expect(setNote).not.toHaveBeenCalled();
  });

  it("allows legend: '' (clear) but rejects whitespace-only legend", async () => {
    const { runtime, setNote } = makeRuntime(() => ({
      i: 5,
      previousName: null,
      previousLegend: "Old",
    }));
    const tool = createSetMarkerNoteTool(runtime);
    const clear = await tool.execute({ marker: 5, name: "X", legend: "" });
    expect(clear.isError).toBeFalsy();
    expect(setNote).toHaveBeenCalledWith(5, "X", "");
    setNote.mockClear();
    const ws = await tool.execute({ marker: 5, name: "X", legend: "   " });
    expect(ws.isError).toBe(true);
    expect(setNote).not.toHaveBeenCalled();
  });

  it("rejects non-string legend types", async () => {
    const { runtime, setNote } = makeRuntime(() => ({
      i: 5,
      previousName: null,
      previousLegend: null,
    }));
    const tool = createSetMarkerNoteTool(runtime);
    const result = await tool.execute({ marker: 5, name: "X", legend: 42 });
    expect(result.isError).toBe(true);
    expect(setNote).not.toHaveBeenCalled();
  });

  it("errors when the marker isn't found", async () => {
    const { runtime, setNote } = makeRuntime(() => null);
    const tool = createSetMarkerNoteTool(runtime);
    const result = await tool.execute({ marker: 999, name: "X" });
    expect(result.isError).toBe(true);
    expect(setNote).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 5,
      previousName: null,
      previousLegend: null,
    }));
    runtime.setNote = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetMarkerNoteTool(runtime);
    const result = await tool.execute({ marker: 5, name: "X" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects invalid ref/name types", async () => {
    const { runtime, setNote } = makeRuntime(() => null);
    const tool = createSetMarkerNoteTool(runtime);
    for (const bad of [
      { marker: null, name: "X" },
      { marker: "", name: "X" },
      { marker: 1.5, name: "X" },
      { marker: -1, name: "X" },
      { marker: 1, name: 42 },
    ]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
    expect(setNote).not.toHaveBeenCalled();
  });
});

describe("findMarkerNoteRef", () => {
  it("resolves a numeric id when the marker exists", () => {
    const pack = { markers: [{ i: 0 }, { i: 1 }, { i: 2 }] };
    const notes = [{ id: "marker1", name: "Rookhold", legend: "Old" }];
    expect(findMarkerNoteRef(pack, notes, 1)).toEqual({
      i: 1,
      previousName: "Rookhold",
      previousLegend: "Old",
    });
    expect(findMarkerNoteRef(pack, notes, 2)).toEqual({
      i: 2,
      previousName: null,
      previousLegend: null,
    });
  });

  it("returns null for missing or removed markers", () => {
    const pack = {
      markers: [{ i: 1 }, { i: 2, removed: true }],
    };
    expect(findMarkerNoteRef(pack, [], 99)).toBeNull();
    expect(findMarkerNoteRef(pack, [], 2)).toBeNull();
    expect(findMarkerNoteRef(undefined, [], 1)).toBeNull();
  });

  it("resolves by case-insensitive note name", () => {
    const pack = { markers: [{ i: 5 }] };
    const notes = [{ id: "marker5", name: "Rookhold" }];
    expect(findMarkerNoteRef(pack, notes, "ROOKHOLD")).toMatchObject({
      i: 5,
    });
    expect(findMarkerNoteRef(pack, notes, "nowhere")).toBeNull();
  });

  it("skips notes whose marker has been removed", () => {
    const pack = { markers: [{ i: 5, removed: true }] };
    const notes = [{ id: "marker5", name: "Rookhold" }];
    expect(findMarkerNoteRef(pack, notes, "rookhold")).toBeNull();
  });
});

describe("defaultMarkerNoteRuntime.setNote", () => {
  let previousNotes: unknown;

  beforeEach(() => {
    previousNotes = (globalThis as { notes?: unknown }).notes;
  });
  afterEach(() => {
    if (previousNotes === undefined) {
      delete (globalThis as { notes?: unknown }).notes;
    } else {
      (globalThis as { notes?: unknown }).notes = previousNotes;
    }
  });

  it("creates a new note when one doesn't exist", () => {
    (globalThis as { notes?: unknown[] }).notes = [];
    defaultMarkerNoteRuntime.setNote(7, "Fresh POI", "Brand new lore");
    const notes = (globalThis as { notes: Array<{ id: string }> }).notes;
    expect(notes).toContainEqual({
      id: "marker7",
      name: "Fresh POI",
      legend: "Brand new lore",
    });
  });

  it("updates an existing note and leaves legend untouched when undefined", () => {
    (globalThis as { notes?: unknown[] }).notes = [
      { id: "marker3", name: "Old", legend: "Keep me" },
    ];
    defaultMarkerNoteRuntime.setNote(3, "New", undefined);
    const notes = (
      globalThis as {
        notes: Array<{ id: string; name: string; legend: string }>;
      }
    ).notes;
    expect(notes[0]).toEqual({
      id: "marker3",
      name: "New",
      legend: "Keep me",
    });
  });
});
