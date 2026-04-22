import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote } from "./_shared";
import {
  createRemoveNoteTool,
  type NoteRemovalRuntime,
  type RemoveNoteRef,
  removeNoteTool,
} from "./remove-note";

function makeRuntime(find: (id: string) => RemoveNoteRef | null): {
  runtime: NoteRemovalRuntime;
  remove: ReturnType<typeof vi.fn<NoteRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<NoteRemovalRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_note tool", () => {
  it("removes by id and returns name + legend", async () => {
    const { runtime, remove } = makeRuntime((id) =>
      id === "burg12"
        ? { id: "burg12", name: "Rookholm", legend: "Old lore" }
        : null,
    );
    const tool = createRemoveNoteTool(runtime);
    const result = await tool.execute({ id: "burg12" });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith("burg12");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "burg12",
      name: "Rookholm",
      legend: "Old lore",
    });
  });

  it("trims the id before looking up", async () => {
    const find = vi.fn<NoteRemovalRuntime["find"]>((id) =>
      id === "state3" ? { id, name: "Ashholm", legend: "" } : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveNoteTool(runtime);
    await tool.execute({ id: "  state3  " });
    expect(find).toHaveBeenCalledWith("state3");
    expect(remove).toHaveBeenCalledWith("state3");
  });

  it("errors when the id is unknown", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveNoteTool(runtime);
    const result = await tool.execute({ id: "ghost" });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid ids", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveNoteTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ id: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: NoteRemovalRuntime = {
      find: () => ({ id: "x", name: "x", legend: "" }),
      remove: vi.fn(() => {
        throw new Error("window.notes is not available.");
      }),
    };
    const tool = createRemoveNoteTool(runtime);
    const result = await tool.execute({ id: "x" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });
});

describe("defaultNoteRemovalRuntime (integration)", () => {
  const originalNotes = (globalThis as { notes?: unknown }).notes;

  beforeEach(() => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "burg12", name: "Rookholm", legend: "Old lore" },
      { id: "state3", name: "Ashholm", legend: "Rising power." },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    (globalThis as { notes?: unknown }).notes = originalNotes;
  });

  it("splices the matching note out of the live array", async () => {
    const result = await removeNoteTool.execute({ id: "burg12" });
    expect(result.isError).toBeFalsy();
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.id).toBe("state3");
  });

  it("preserves the array reference (in-place splice)", async () => {
    const before = (globalThis as { notes: RawNote[] }).notes;
    await removeNoteTool.execute({ id: "burg12" });
    const after = (globalThis as { notes: RawNote[] }).notes;
    expect(after).toBe(before);
  });

  it("errors when the id does not exist", async () => {
    const result = await removeNoteTool.execute({ id: "ghost" });
    expect(result.isError).toBe(true);
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toHaveLength(2);
  });

  it("errors when window.notes is missing", async () => {
    (globalThis as { notes?: unknown }).notes = undefined;
    const result = await removeNoteTool.execute({ id: "anything" });
    expect(result.isError).toBe(true);
  });

  it("removing the only note leaves an empty array", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "only", name: "only", legend: "" },
    ] satisfies RawNote[];
    await removeNoteTool.execute({ id: "only" });
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toEqual([]);
  });
});
