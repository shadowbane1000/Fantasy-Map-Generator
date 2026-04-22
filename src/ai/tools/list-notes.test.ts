import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawNote } from "./_shared";
import {
  classifyNoteId,
  createListNotesTool,
  listNotesTool,
  type NoteSummary,
  type NotesRuntime,
  stripHtml,
} from "./list-notes";

function runtimeOf(notes: RawNote[] | null): NotesRuntime {
  return { readNotes: () => notes };
}

describe("classifyNoteId", () => {
  it("classifies known prefixes", () => {
    expect(classifyNoteId("burg1")).toBe("burg");
    expect(classifyNoteId("marker5")).toBe("marker");
    expect(classifyNoteId("regiment1-2")).toBe("regiment");
    expect(classifyNoteId("state3")).toBe("state");
    expect(classifyNoteId("province7")).toBe("province");
    expect(classifyNoteId("culture2")).toBe("culture");
    expect(classifyNoteId("religion4")).toBe("religion");
    expect(classifyNoteId("river9")).toBe("river");
    expect(classifyNoteId("route3")).toBe("route");
    expect(classifyNoteId("lake1")).toBe("lake");
    expect(classifyNoteId("battle12")).toBe("battle");
    expect(classifyNoteId("label5")).toBe("label");
    expect(classifyNoteId("zone7")).toBe("zone");
  });

  it("falls back to 'other' for unknown prefixes", () => {
    expect(classifyNoteId("custom-thing")).toBe("other");
    expect(classifyNoteId("foo1")).toBe("other");
    expect(classifyNoteId("")).toBe("other");
  });

  it("handles non-string input safely", () => {
    expect(classifyNoteId(null)).toBe("other");
    expect(classifyNoteId(undefined)).toBe("other");
    expect(classifyNoteId(42)).toBe("other");
  });

  it("longer prefix wins over shorter one", () => {
    expect(classifyNoteId("religion12")).toBe("religion");
    expect(classifyNoteId("regiment1-2")).toBe("regiment");
  });
});

describe("stripHtml", () => {
  it("strips simple tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
    expect(stripHtml("<b><i>Bold italic</i></b>")).toBe("Bold italic");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("a   b\n\nc")).toBe("a b c");
  });

  it("safely handles non-strings", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
  });

  it("trims leading/trailing whitespace", () => {
    expect(stripHtml("  hi  ")).toBe("hi");
  });
});

function fakeNotes(): RawNote[] {
  return [
    {
      id: "burg12",
      name: "Rookholm",
      legend:
        "<p>A bustling trade city on the Ashwater. <em>Famous for its markets.</em></p>",
    },
    {
      id: "regiment1-2",
      name: "Phalanx",
      legend: "Elite guard regiment.",
    },
    {
      id: "marker5",
      name: "Dragon Lair",
      legend: "<p>Here there be dragons.</p>",
    },
    {
      id: "state3",
      name: "Ashholm",
      legend:
        "The realm of kings. " +
        "This is a very long legend description. ".repeat(20),
    },
  ];
}

describe("list_notes tool", () => {
  it("returns all notes by default with truncated legend previews", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
    expect(body.notes).toHaveLength(4);
    const burg = body.notes.find((n: NoteSummary) => n.id === "burg12");
    expect(burg.type).toBe("burg");
    expect(burg.legend).not.toContain("<");
    expect(burg.legend).toBe(
      "A bustling trade city on the Ashwater. Famous for its markets.",
    );
    expect(burg.legend_truncated).toBe(false);
  });

  it("truncates long legends at the default 300 chars", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const state = body.notes.find((n: NoteSummary) => n.id === "state3");
    expect(state.legend_truncated).toBe(true);
    expect(state.legend.length).toBeLessThanOrEqual(302); // 300 + "…"
    expect(state.legend_length).toBeGreaterThan(300);
  });

  it("full_legend:true returns raw HTML untouched", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ full_legend: true });
    const body = JSON.parse(result.content);
    const burg = body.notes.find((n: NoteSummary) => n.id === "burg12");
    expect(burg.legend).toContain("<p>");
    expect(burg.legend_truncated).toBe(false);
    expect(body.filters.full_legend).toBe(true);
  });

  it("max_legend_length override is respected", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ max_legend_length: 10 });
    const body = JSON.parse(result.content);
    const burg = body.notes.find((n: NoteSummary) => n.id === "burg12");
    expect(burg.legend.length).toBeLessThanOrEqual(11); // 10 + "…"
    expect(burg.legend_truncated).toBe(true);
  });

  it("filters by type", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ type: "burg" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.notes[0]?.id).toBe("burg12");
  });

  it("filters regiment-prefixed ids despite the trailing numbers", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ type: "regiment" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.notes[0]?.id).toBe("regiment1-2");
  });

  it("searches case-insensitively in name", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ search: "DRAGON" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.notes[0]?.id).toBe("marker5");
  });

  it("searches case-insensitively in legend (after HTML strip)", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ search: "markets" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.notes[0]?.id).toBe("burg12");
  });

  it("rejects invalid filters", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    expect((await tool.execute({ type: 42 })).isError).toBe(true);
    expect((await tool.execute({ type: "" })).isError).toBe(true);
    expect((await tool.execute({ search: 42 })).isError).toBe(true);
    expect((await tool.execute({ full_legend: "yes" })).isError).toBe(true);
    expect((await tool.execute({ max_legend_length: 0 })).isError).toBe(true);
    expect((await tool.execute({ max_legend_length: 99999 })).isError).toBe(
      true,
    );
    expect((await tool.execute({ max_legend_length: 1.5 })).isError).toBe(true);
  });

  it("returns not-ready error when window.notes is missing", async () => {
    const tool = createListNotesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("honors pagination", async () => {
    const tool = createListNotesTool(runtimeOf(fakeNotes()));
    const result = await tool.execute({ limit: 2, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.notes).toHaveLength(2);
    expect(body.notes[0]?.id).toBe("regiment1-2");
  });
});

describe("defaultNotesRuntime (integration)", () => {
  const originalNotes = (globalThis as { notes?: unknown }).notes;

  beforeEach(() => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "burg1", name: "Test Burg", legend: "Some <b>lore</b>" },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    (globalThis as { notes?: unknown }).notes = originalNotes;
  });

  it("reads from the live globalThis.notes", async () => {
    const result = await listNotesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.notes[0]?.legend).toBe("Some lore");
  });
});
