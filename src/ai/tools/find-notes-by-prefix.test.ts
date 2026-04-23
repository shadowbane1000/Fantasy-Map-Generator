import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawNote } from "./_shared";
import {
  createFindNotesByPrefixTool,
  DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT,
  defaultFindNotesByPrefixRuntime,
  type FindNotesByPrefixRuntime,
  findNotesByPrefixInNotes,
  findNotesByPrefixTool,
  MAX_FIND_NOTES_BY_PREFIX_LIMIT,
  NOTE_LEGEND_PREVIEW_MAX,
} from "./find-notes-by-prefix";

function runtimeOf(notes: RawNote[] | null): FindNotesByPrefixRuntime {
  return { readNotes: () => notes };
}

function fakeNotes(): RawNote[] {
  return [
    { id: "burg1", name: "Rookholm", legend: "<p>Trade city.</p>" },
    { id: "burg10", name: "Ashwater", legend: "Port town." },
    { id: "burg11", name: "Dawnforge", legend: "Smithing hub." },
    { id: "state3", name: "Ashholm", legend: `A ${"x".repeat(500)}` },
    { id: "state12", name: "Rookhold", legend: "Rising kingdom." },
    { id: "marker5", name: "Dragon Lair", legend: "Beware." },
    { id: "regiment1-2", name: "Phalanx", legend: "Elite guard." },
    { id: "province7", name: "Northmarch", legend: "Border province." },
  ];
}

describe("findNotesByPrefixInNotes (pure collector)", () => {
  it("matches ids with the exact lowercase prefix", () => {
    const result = findNotesByPrefixInNotes(fakeNotes(), "burg", 1000);
    expect(result.count).toBe(3);
    expect(result.notes.map((n) => n.id)).toEqual([
      "burg1",
      "burg10",
      "burg11",
    ]);
  });

  it("matches ids case-insensitively", () => {
    const notes: RawNote[] = [
      { id: "Burg1", name: "A", legend: "" },
      { id: "BURG2", name: "B", legend: "" },
      { id: "state1", name: "C", legend: "" },
    ];
    const result = findNotesByPrefixInNotes(notes, "burg", 1000);
    expect(result.count).toBe(2);
    expect(result.notes.map((n) => n.id).sort()).toEqual(["BURG2", "Burg1"]);
  });

  it("truncates long legends at 200 chars with a trailing ellipsis", () => {
    const long = "y".repeat(NOTE_LEGEND_PREVIEW_MAX + 50);
    const result = findNotesByPrefixInNotes(
      [{ id: "burg1", name: "N", legend: long }],
      "burg",
      1000,
    );
    const hit = result.notes[0];
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.legend_truncated).toBe(true);
    expect(hit.legend.length).toBe(NOTE_LEGEND_PREVIEW_MAX + 1); // 200 + "…"
    expect(hit.legend.endsWith("…")).toBe(true);
    expect(hit.legend.slice(0, 5)).toBe("yyyyy");
  });

  it("does not truncate short legends", () => {
    const result = findNotesByPrefixInNotes(
      [{ id: "burg1", name: "N", legend: "short" }],
      "burg",
      1000,
    );
    expect(result.notes[0]?.legend_truncated).toBe(false);
    expect(result.notes[0]?.legend).toBe("short");
  });

  it("does not truncate a legend exactly at the cap", () => {
    const exact = "z".repeat(NOTE_LEGEND_PREVIEW_MAX);
    const result = findNotesByPrefixInNotes(
      [{ id: "burg1", name: "N", legend: exact }],
      "burg",
      1000,
    );
    expect(result.notes[0]?.legend_truncated).toBe(false);
    expect(result.notes[0]?.legend).toBe(exact);
  });

  it("echoes raw HTML in legend (no stripping)", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    const result = findNotesByPrefixInNotes(
      [{ id: "burg1", name: "N", legend: html }],
      "burg",
      1000,
    );
    expect(result.notes[0]?.legend).toBe(html);
  });

  it("defaults missing name / legend to empty strings", () => {
    const result = findNotesByPrefixInNotes(
      [{ id: "burg1" }] as unknown as RawNote[],
      "burg",
      1000,
    );
    expect(result.notes[0]).toEqual({
      id: "burg1",
      name: "",
      legend: "",
      legend_truncated: false,
    });
  });

  it("ignores notes whose id is not a string", () => {
    const notes = [
      { id: "burg1", name: "A", legend: "" },
      { id: 42 as unknown as string, name: "B", legend: "" },
      { id: undefined as unknown as string, name: "C", legend: "" },
      { id: null as unknown as string, name: "D", legend: "" },
    ] as RawNote[];
    const result = findNotesByPrefixInNotes(notes, "burg", 1000);
    expect(result.count).toBe(1);
    expect(result.notes[0]?.id).toBe("burg1");
  });

  it("caps notes at limit but preserves unlimited count", () => {
    const result = findNotesByPrefixInNotes(fakeNotes(), "burg", 2);
    expect(result.count).toBe(3);
    expect(result.notes).toHaveLength(2);
    expect(result.notes.map((n) => n.id)).toEqual(["burg1", "burg10"]);
  });

  it("returns empty notes + count:0 when no id matches", () => {
    const result = findNotesByPrefixInNotes(fakeNotes(), "missing", 1000);
    expect(result.count).toBe(0);
    expect(result.notes).toEqual([]);
  });

  it("matches everything when prefix is empty-string (internal call)", () => {
    // Tool layer rejects empty prefix; collector itself matches all.
    const result = findNotesByPrefixInNotes(fakeNotes(), "", 1000);
    expect(result.count).toBe(fakeNotes().length);
  });
});

describe("find_notes_by_prefix tool — surface", () => {
  it("returns ok=true with echoed prefix and matching notes", async () => {
    const tool = createFindNotesByPrefixTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ prefix: "state" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      prefix: "state",
      count: 2,
    });
    expect(body.notes.map((n: { id: string }) => n.id)).toEqual([
      "state3",
      "state12",
    ]);
  });

  it("lowercases and trims the echoed prefix", async () => {
    const tool = createFindNotesByPrefixTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ prefix: "  BURG  " });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.prefix).toBe("burg");
    expect(body.count).toBe(3);
  });

  it("matches case-insensitively against note ids", async () => {
    const mixed: RawNote[] = [
      { id: "MarKer5", name: "A", legend: "" },
      { id: "marker6", name: "B", legend: "" },
      { id: "state1", name: "C", legend: "" },
    ];
    const tool = createFindNotesByPrefixTool(runtimeOf(mixed));
    const result = await tool.execute({ prefix: "MARKER" });
    const body = JSON.parse(result.content);
    expect(body.count).toBe(2);
  });

  it("applies the default limit when omitted", async () => {
    // Synthesize more than DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT hits, then ask
    // for the default and make sure count is uncapped but notes is capped.
    const synth: RawNote[] = [];
    for (let i = 0; i < DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT + 5; i++) {
      synth.push({ id: `burg${i}`, name: `B${i}`, legend: "" });
    }
    const tool = createFindNotesByPrefixTool(runtimeOf(synth));
    const result = await tool.execute({ prefix: "burg" });
    const body = JSON.parse(result.content);
    expect(body.count).toBe(DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT + 5);
    expect(body.notes).toHaveLength(DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT);
  });

  it("accepts a non-default limit", async () => {
    const tool = createFindNotesByPrefixTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ prefix: "burg", limit: 1 });
    const body = JSON.parse(result.content);
    expect(body.count).toBe(3);
    expect(body.notes).toHaveLength(1);
  });

  it("rejects missing / empty / non-string prefix", async () => {
    const tool = createFindNotesByPrefixTool(runtimeOf(fakeNotes()));
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      const r = await tool.execute({ prefix: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/prefix/i);
    }
  });

  it("rejects invalid limit values", async () => {
    const tool = createFindNotesByPrefixTool(runtimeOf(fakeNotes()));
    for (const bad of [0, -1, 1.5, "10", MAX_FIND_NOTES_BY_PREFIX_LIMIT + 1]) {
      const r = await tool.execute({ prefix: "burg", limit: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/);
    }
  });

  it("surfaces not-ready as a structured error when notes are missing", async () => {
    const tool = createFindNotesByPrefixTool(runtimeOf(null));
    const result = await tool.execute({ prefix: "burg" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("is exported as findNotesByPrefixTool with the expected schema", () => {
    expect(findNotesByPrefixTool.name).toBe("find_notes_by_prefix");
    expect(findNotesByPrefixTool.input_schema.type).toBe("object");
    expect(findNotesByPrefixTool.input_schema.required).toEqual(["prefix"]);
    expect(findNotesByPrefixTool.input_schema.properties.prefix).toBeDefined();
    expect(findNotesByPrefixTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes the documented constants", () => {
    expect(DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT).toBe(1000);
    expect(MAX_FIND_NOTES_BY_PREFIX_LIMIT).toBe(10000);
    expect(NOTE_LEGEND_PREVIEW_MAX).toBe(200);
  });
});

describe("defaultFindNotesByPrefixRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { notes?: unknown };
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.notes = [
      { id: "burg12", name: "Rookholm", legend: "Trade city." },
      { id: "burg13", name: "Ashwater", legend: "Port." },
      { id: "state3", name: "Ashholm", legend: "A kingdom." },
    ] as unknown as RawNote[];
  });

  afterEach(() => {
    globalsRef.notes = originalNotes;
  });

  it("reads from the live globalThis.notes end-to-end", async () => {
    const result = await findNotesByPrefixTool.execute({ prefix: "burg" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(2);
    expect(body.notes.map((n: { id: string }) => n.id).sort()).toEqual([
      "burg12",
      "burg13",
    ]);
  });

  it("defaultFindNotesByPrefixRuntime.readNotes returns the live array", () => {
    const notes = defaultFindNotesByPrefixRuntime.readNotes();
    expect(Array.isArray(notes)).toBe(true);
    expect(notes?.length).toBe(3);
  });

  it("returns not-ready when globalThis.notes is missing", async () => {
    globalsRef.notes = undefined;
    const result = await findNotesByPrefixTool.execute({ prefix: "burg" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("returns not-ready when globalThis.notes is not an array", async () => {
    globalsRef.notes = { id: "burg12" } as unknown;
    const result = await findNotesByPrefixTool.execute({ prefix: "burg" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });
});
