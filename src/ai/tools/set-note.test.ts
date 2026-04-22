import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote } from "./_shared";
import {
  createSetNoteTool,
  type NoteRef,
  type NoteRuntime,
  setNoteTool,
} from "./set-note";

function makeRuntime(find: (id: string) => NoteRef | null): {
  runtime: NoteRuntime;
  write: ReturnType<typeof vi.fn<NoteRuntime["write"]>>;
} {
  const write = vi.fn<NoteRuntime["write"]>();
  return { runtime: { find, write }, write };
}

describe("set_note tool", () => {
  it("updates name only on an existing note", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "burg12",
      name: "Old",
      legend: "keep",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "burg12", name: "New" });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith("burg12", "New", "keep");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "burg12",
      created: false,
      previousName: "Old",
      previousLegend: "keep",
      name: "New",
      legend: "keep",
    });
  });

  it("updates legend only on an existing note", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "state3",
      name: "keep",
      legend: "old",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    await tool.execute({ id: "state3", legend: "new <p>lore</p>" });
    expect(write).toHaveBeenCalledWith("state3", "keep", "new <p>lore</p>");
  });

  it("updates both name and legend", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "state3",
      name: "Old",
      legend: "old",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    await tool.execute({ id: "state3", name: "Ashholm", legend: "new" });
    expect(write).toHaveBeenCalledWith("state3", "Ashholm", "new");
  });

  it("allows empty string to clear the legend", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "s",
      name: "n",
      legend: "bye",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "s", legend: "" });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith("s", "n", "");
  });

  it("rejects whitespace-only legend", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "s",
      name: "n",
      legend: "x",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "s", legend: "   \n  " });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("creates a new note when missing (requires name)", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({
      id: "province7",
      name: "Upland",
      legend: "Highland country.",
    });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith(
      "province7",
      "Upland",
      "Highland country.",
    );
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "province7",
      created: true,
      previousName: null,
      previousLegend: null,
      name: "Upland",
      legend: "Highland country.",
    });
  });

  it("errors when neither name nor legend is provided", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "s",
      name: "n",
      legend: "l",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "s" });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("errors when creating a new note without a name", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "new-one", legend: "lore" });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects invalid ids", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetNoteTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ id: bad, name: "x" });
      expect(r.isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects invalid names when provided", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "s",
      name: "n",
      legend: "l",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    for (const bad of ["", "   ", 42, {}]) {
      const r = await tool.execute({ id: "s", name: bad });
      expect(r.isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects non-string legend", async () => {
    const { runtime, write } = makeRuntime(() => ({
      id: "s",
      name: "n",
      legend: "l",
      existed: true,
    }));
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "s", legend: 42 });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("surfaces runtime write failures", async () => {
    const runtime: NoteRuntime = {
      find: () => ({ id: "s", name: "n", legend: "l", existed: true }),
      write: vi.fn(() => {
        throw new Error("notes unavailable");
      }),
    };
    const tool = createSetNoteTool(runtime);
    const result = await tool.execute({ id: "s", name: "New" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/notes unavailable/);
  });
});

describe("defaultNoteRuntime (integration)", () => {
  const originalNotes = (globalThis as { notes?: unknown }).notes;

  beforeEach(() => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "burg12", name: "Rookholm", legend: "Old lore" },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    (globalThis as { notes?: unknown }).notes = originalNotes;
  });

  it("updates the existing note name", async () => {
    await setNoteTool.execute({ id: "burg12", name: "Rookholm Prime" });
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes[0]?.name).toBe("Rookholm Prime");
    expect(notes[0]?.legend).toBe("Old lore");
  });

  it("updates the existing note legend", async () => {
    await setNoteTool.execute({ id: "burg12", legend: "New lore" });
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes[0]?.name).toBe("Rookholm");
    expect(notes[0]?.legend).toBe("New lore");
  });

  it("creates a new note when none exists", async () => {
    await setNoteTool.execute({
      id: "state3",
      name: "Ashholm",
      legend: "A rising power.",
    });
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toHaveLength(2);
    expect(notes[1]).toEqual({
      id: "state3",
      name: "Ashholm",
      legend: "A rising power.",
    });
  });

  it("initializes window.notes if it's missing", async () => {
    (globalThis as { notes?: unknown }).notes = undefined;
    const result = await setNoteTool.execute({
      id: "region1",
      name: "Test",
    });
    expect(result.isError).toBeFalsy();
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toEqual([{ id: "region1", name: "Test", legend: "" }]);
  });
});
