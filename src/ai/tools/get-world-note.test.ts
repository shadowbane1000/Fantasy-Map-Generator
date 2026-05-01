import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawNote } from "./_shared";
import {
  createGetWorldNoteTool,
  type GetWorldNoteRuntime,
  getWorldNoteTool,
  type WorldNoteInfo,
} from "./get-world-note";

function runtimeOf(map: Record<string, WorldNoteInfo>): GetWorldNoteRuntime {
  return { read: (rawId) => map[rawId] ?? null };
}

describe("get_world_note tool — pure / seam", () => {
  it("reads an existing predefined-topic note", async () => {
    const tool = createGetWorldNoteTool(
      runtimeOf({
        "world:premise": {
          topic: "premise",
          rawId: "world:premise",
          name: "World — Premise",
          legend: "A world adrift between stars.",
        },
      }),
    );
    const result = await tool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "premise",
      raw_id: "world:premise",
      name: "World — Premise",
      legend: "A world adrift between stars.",
    });
  });

  it("reads an existing arbitrary-topic note", async () => {
    const tool = createGetWorldNoteTool(
      runtimeOf({
        "world:factions": {
          topic: "factions",
          rawId: "world:factions",
          name: "World — Factions",
          legend: "Three guilds vie.",
        },
      }),
    );
    const result = await tool.execute({ topic: "factions" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "factions",
      raw_id: "world:factions",
      name: "World — Factions",
      legend: "Three guilds vie.",
    });
  });

  it("returns exists:false when note is absent (forgiving)", async () => {
    const tool = createGetWorldNoteTool({ read: () => null });
    const result = await tool.execute({ topic: "magic" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "magic",
      raw_id: "world:magic",
      exists: false,
    });
  });

  it("returns long legends untruncated", async () => {
    const long = "L".repeat(8000);
    const tool = createGetWorldNoteTool(
      runtimeOf({
        "world:history": {
          topic: "history",
          rawId: "world:history",
          name: "n",
          legend: long,
        },
      }),
    );
    const result = await tool.execute({ topic: "history" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).legend.length).toBe(8000);
  });

  it("rejects bad topic regex", async () => {
    const tool = createGetWorldNoteTool({ read: () => null });
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
  });

  it("rejects missing / non-string topic", async () => {
    const tool = createGetWorldNoteTool({ read: () => null });
    for (const bad of [undefined, null, 42, {}, []]) {
      const r = await tool.execute({ topic: bad });
      expect(r.isError).toBe(true);
    }
  });

  it("is exported as getWorldNoteTool with the expected schema", () => {
    expect(getWorldNoteTool.name).toBe("get_world_note");
    expect(getWorldNoteTool.input_schema.type).toBe("object");
    expect(getWorldNoteTool.input_schema.required).toEqual(["topic"]);
    expect(getWorldNoteTool.input_schema.properties.topic).toBeDefined();
  });
});

describe("defaultGetWorldNoteRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { notes?: unknown };
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.notes = [
      { id: "burg12", name: "Rookholm", legend: "Trade city." },
      {
        id: "world:premise",
        name: "World — Premise",
        legend: "A world adrift between stars.",
      },
      {
        id: "world:factions",
        name: "World — Factions",
        legend: "Three guilds.",
      },
      // Note with non-string fields — defaults should kick in.
      { id: "world:bare" },
    ] satisfies RawNote[] as unknown;
  });

  afterEach(() => {
    globalsRef.notes = originalNotes;
  });

  it("reads a predefined-topic world note", async () => {
    const result = await getWorldNoteTool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "premise",
      raw_id: "world:premise",
      name: "World — Premise",
      legend: "A world adrift between stars.",
    });
  });

  it("reads an arbitrary-topic world note", async () => {
    const result = await getWorldNoteTool.execute({ topic: "factions" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).legend).toBe("Three guilds.");
  });

  it("defaults missing name / legend to empty strings", async () => {
    const result = await getWorldNoteTool.execute({ topic: "bare" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "bare",
      raw_id: "world:bare",
      name: "",
      legend: "",
    });
  });

  it("returns exists:false for an unknown topic", async () => {
    const result = await getWorldNoteTool.execute({ topic: "magic" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "magic",
      raw_id: "world:magic",
      exists: false,
    });
  });

  it("returns exists:false when window.notes is missing (forgiving)", async () => {
    globalsRef.notes = undefined;
    const result = await getWorldNoteTool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "premise",
      raw_id: "world:premise",
      exists: false,
    });
  });

  it("returns exists:false when window.notes is not an array", async () => {
    globalsRef.notes = { id: "burg12" };
    const result = await getWorldNoteTool.execute({ topic: "premise" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).exists).toBe(false);
  });
});
