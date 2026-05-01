import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote } from "./_shared";
import {
  createSetWorldNoteTool,
  type SetWorldNoteRuntime,
  setWorldNoteTool,
  type WorldNoteRef,
} from "./set-world-note";

function makeRuntime(find: (rawId: string) => WorldNoteRef | null): {
  runtime: SetWorldNoteRuntime;
  write: ReturnType<typeof vi.fn<SetWorldNoteRuntime["write"]>>;
} {
  const write = vi.fn<SetWorldNoteRuntime["write"]>();
  return { runtime: { find, write }, write };
}

describe("set_world_note tool — pure / seam", () => {
  it("creates a new note for a predefined topic with default name", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({
      topic: "premise",
      legend: "A world adrift between stars.",
    });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith(
      "world:premise",
      "World — Premise",
      "A world adrift between stars.",
    );
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      topic: "premise",
      raw_id: "world:premise",
      previous_legend: null,
      legend: "A world adrift between stars.",
      name: "World — Premise",
    });
  });

  it("creates a new note for an arbitrary topic with default name", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({
      topic: "factions",
      legend: "Three guilds vie for the throne.",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.raw_id).toBe("world:factions");
    expect(body.name).toBe("World — Factions");
    expect(write).toHaveBeenCalledWith(
      "world:factions",
      "World — Factions",
      "Three guilds vie for the throne.",
    );
  });

  it("updates an existing note's legend; previous_legend reflects prior value", async () => {
    const { runtime, write } = makeRuntime(() => ({
      topic: "cosmology",
      rawId: "world:cosmology",
      name: "Old Name",
      legend: "Old cosmology lore.",
      existed: true,
    }));
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({
      topic: "cosmology",
      legend: "New cosmology lore.",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_legend).toBe("Old cosmology lore.");
    expect(body.legend).toBe("New cosmology lore.");
    // Default name is applied even if a different name was previously stored,
    // because no `name` was supplied.
    expect(body.name).toBe("World — Cosmology");
    expect(write).toHaveBeenCalledWith(
      "world:cosmology",
      "World — Cosmology",
      "New cosmology lore.",
    );
  });

  it("custom name overrides the default", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({
      topic: "magic",
      legend: "Mana flows downstream from the moon.",
      name: "The Way of Mana",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).name).toBe("The Way of Mana");
    expect(write).toHaveBeenCalledWith(
      "world:magic",
      "The Way of Mana",
      "Mana flows downstream from the moon.",
    );
  });

  it("trims a custom name", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    await tool.execute({
      topic: "magic",
      legend: "x",
      name: "  Custom  ",
    });
    expect(write).toHaveBeenCalledWith("world:magic", "Custom", "x");
  });

  it("allows empty-string legend to clear", async () => {
    const { runtime, write } = makeRuntime(() => ({
      topic: "history",
      rawId: "world:history",
      name: "World — History",
      legend: "old",
      existed: true,
    }));
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "history", legend: "" });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith("world:history", "World — History", "");
  });

  it("rejects whitespace-only legend", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({
      topic: "premise",
      legend: "   \n  ",
    });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects non-string legend", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "premise", legend: 42 });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects bad topic regex", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const bads = [
      "Premise", // uppercase
      "1story", // leading digit
      "-foo", // leading hyphen
      "_foo", // leading underscore
      "this-is-a-very-long-topic-that-exceeds-32-chars", // > 32
      "has space",
      "has:colon",
      "has.dot",
      "",
    ];
    for (const bad of bads) {
      const r = await tool.execute({ topic: bad, legend: "x" });
      expect(r.isError, `expected reject for ${JSON.stringify(bad)}`).toBe(
        true,
      );
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects missing / non-string topic", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    for (const bad of [undefined, null, 42, {}, []]) {
      const r = await tool.execute({ topic: bad, legend: "x" });
      expect(r.isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects bad name", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    for (const bad of ["", "   ", 42, {}]) {
      const r = await tool.execute({
        topic: "premise",
        legend: "x",
        name: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("accepts the longest legal topic (32 chars)", async () => {
    const { runtime, write } = makeRuntime(() => null);
    const tool = createSetWorldNoteTool(runtime);
    const longest = `a${"b".repeat(31)}`; // 32 chars total, all valid
    const result = await tool.execute({ topic: longest, legend: "x" });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith(
      `world:${longest}`,
      `World — A${"b".repeat(31)}`,
      "x",
    );
  });

  it("surfaces runtime write failures", async () => {
    const runtime: SetWorldNoteRuntime = {
      find: () => null,
      write: vi.fn(() => {
        throw new Error("notes unavailable");
      }),
    };
    const tool = createSetWorldNoteTool(runtime);
    const result = await tool.execute({ topic: "premise", legend: "x" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/notes unavailable/);
  });

  it("is exported as setWorldNoteTool with the expected schema", () => {
    expect(setWorldNoteTool.name).toBe("set_world_note");
    expect(setWorldNoteTool.input_schema.type).toBe("object");
    expect(setWorldNoteTool.input_schema.required).toEqual(["topic", "legend"]);
    expect(setWorldNoteTool.input_schema.properties.topic).toBeDefined();
    expect(setWorldNoteTool.input_schema.properties.legend).toBeDefined();
    expect(setWorldNoteTool.input_schema.properties.name).toBeDefined();
  });
});

describe("defaultSetWorldNoteRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { notes?: unknown };
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.notes = [
      { id: "burg12", name: "Rookholm", legend: "Trade city." },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    globalsRef.notes = originalNotes;
  });

  it("creates a new world note alongside existing entity notes", async () => {
    const result = await setWorldNoteTool.execute({
      topic: "premise",
      legend: "A world adrift between stars.",
    });
    expect(result.isError).toBeFalsy();
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    expect(notes).toHaveLength(2);
    expect(notes[1]).toEqual({
      id: "world:premise",
      name: "World — Premise",
      legend: "A world adrift between stars.",
    });
  });

  it("updates an existing world note in place", async () => {
    globalsRef.notes = [
      {
        id: "world:cosmology",
        name: "World — Cosmology",
        legend: "Old.",
      },
    ];
    await setWorldNoteTool.execute({
      topic: "cosmology",
      legend: "New.",
    });
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0]?.legend).toBe("New.");
  });

  it("creates a note for an arbitrary topic", async () => {
    await setWorldNoteTool.execute({
      topic: "factions",
      legend: "Three guilds.",
    });
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    const f = notes.find((n) => n?.id === "world:factions");
    expect(f).toEqual({
      id: "world:factions",
      name: "World — Factions",
      legend: "Three guilds.",
    });
  });

  it("initializes window.notes if it's missing", async () => {
    globalsRef.notes = undefined;
    const result = await setWorldNoteTool.execute({
      topic: "history",
      legend: "Long ago.",
    });
    expect(result.isError).toBeFalsy();
    const notes = (globalsRef.notes as RawNote[]) ?? [];
    expect(notes).toEqual([
      {
        id: "world:history",
        name: "World — History",
        legend: "Long ago.",
      },
    ]);
  });

  it("previous_legend reflects the prior live legend on update", async () => {
    globalsRef.notes = [
      {
        id: "world:magic",
        name: "World — Magic",
        legend: "Old magic.",
      },
    ];
    const result = await setWorldNoteTool.execute({
      topic: "magic",
      legend: "New magic.",
    });
    expect(JSON.parse(result.content).previous_legend).toBe("Old magic.");
  });
});
