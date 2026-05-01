import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote } from "./_shared";
import {
  createRemoveWorldNoteTool,
  type RemoveWorldNoteRuntime,
  removeWorldNoteTool,
} from "./remove-world-note";

function runtimeOf(remove: (rawId: string) => boolean): {
  runtime: RemoveWorldNoteRuntime;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(remove);
  return { runtime: { remove: spy }, spy };
}

describe("remove_world_note tool — pure / seam", () => {
  it("removes a predefined-topic note (returns removed:true)", async () => {
    const { runtime, spy } = runtimeOf(() => true);
    const tool = createRemoveWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledWith("world:premise");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "premise",
      raw_id: "world:premise",
      removed: true,
    });
  });

  it("removes an arbitrary-topic note (returns removed:true)", async () => {
    const { runtime, spy } = runtimeOf(() => true);
    const tool = createRemoveWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "factions" });
    expect(result.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledWith("world:factions");
    expect(JSON.parse(result.content).raw_id).toBe("world:factions");
  });

  it("is idempotent: removed:false when no note exists (no error)", async () => {
    const { runtime } = runtimeOf(() => false);
    const tool = createRemoveWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "magic" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "magic",
      raw_id: "world:magic",
      removed: false,
    });
  });

  it("rejects bad topic regex", async () => {
    const { runtime, spy } = runtimeOf(() => true);
    const tool = createRemoveWorldNoteTool(runtime);
    for (const bad of [
      "Premise",
      "1story",
      "-foo",
      "this-is-a-very-long-topic-that-exceeds-32-chars",
      "has space",
      "has:colon",
      "",
    ]) {
      const r = await tool.execute({ topic: bad });
      expect(r.isError).toBe(true);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects missing / non-string topic", async () => {
    const { runtime, spy } = runtimeOf(() => true);
    const tool = createRemoveWorldNoteTool(runtime);
    for (const bad of [undefined, null, 42, {}, []]) {
      const r = await tool.execute({ topic: bad });
      expect(r.isError).toBe(true);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RemoveWorldNoteRuntime = {
      remove: vi.fn(() => {
        throw new Error("notes unavailable");
      }),
    };
    const tool = createRemoveWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "premise" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/notes unavailable/);
  });

  it("is exported as removeWorldNoteTool with the expected schema", () => {
    expect(removeWorldNoteTool.name).toBe("remove_world_note");
    expect(removeWorldNoteTool.input_schema.type).toBe("object");
    expect(removeWorldNoteTool.input_schema.required).toEqual(["topic"]);
    expect(removeWorldNoteTool.input_schema.properties.topic).toBeDefined();
  });
});

describe("defaultRemoveWorldNoteRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { notes?: unknown };
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.notes = [
      { id: "burg12", name: "Rookholm", legend: "Trade city." },
      {
        id: "world:premise",
        name: "World — Premise",
        legend: "p",
      },
      { id: "world:factions", name: "World — Factions", legend: "f" },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    globalsRef.notes = originalNotes;
  });

  it("splices the matching world note out of the live array", async () => {
    const result = await removeWorldNoteTool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed).toBe(true);
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    expect(notes.map((n) => n.id)).toEqual(["burg12", "world:factions"]);
  });

  it("preserves the array reference (in-place splice)", async () => {
    const before = globalsRef.notes;
    await removeWorldNoteTool.execute({ topic: "factions" });
    const after = globalsRef.notes;
    expect(after).toBe(before);
  });

  it("does not touch non-world notes", async () => {
    await removeWorldNoteTool.execute({ topic: "premise" });
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    expect(notes.find((n) => n?.id === "burg12")).toBeDefined();
  });

  it("idempotent: removed:false when topic doesn't exist (no error)", async () => {
    const result = await removeWorldNoteTool.execute({ topic: "magic" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed).toBe(false);
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    expect(notes).toHaveLength(3);
  });

  it("idempotent: removed:false when window.notes is missing (no error)", async () => {
    globalsRef.notes = undefined;
    const result = await removeWorldNoteTool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed).toBe(false);
  });

  it("idempotent: removed:false when window.notes is not an array", async () => {
    globalsRef.notes = { id: "world:premise" };
    const result = await removeWorldNoteTool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed).toBe(false);
  });
});
