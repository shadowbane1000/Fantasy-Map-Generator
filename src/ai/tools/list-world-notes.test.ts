import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawNote } from "./_shared";
import {
  collectWorldNotes,
  createListWorldNotesTool,
  type ListWorldNotesRuntime,
  listWorldNotesTool,
} from "./list-world-notes";

function runtimeOf(notes: RawNote[] | null): ListWorldNotesRuntime {
  return { readNotes: () => notes };
}

describe("collectWorldNotes (pure collector)", () => {
  it("returns an empty list for a notes array with no world notes", () => {
    const result = collectWorldNotes([
      { id: "burg12", name: "n", legend: "" },
      { id: "state3", name: "n", legend: "" },
    ]);
    expect(result).toEqual([]);
  });

  it("filters out non-world notes", () => {
    const result = collectWorldNotes([
      { id: "burg12", name: "Rookholm", legend: "Trade city." },
      {
        id: "world:premise",
        name: "World — Premise",
        legend: "A world.",
      },
      { id: "state3", name: "Ashholm", legend: "" },
    ]);
    expect(result.map((r) => r.topic)).toEqual(["premise"]);
  });

  it("sorts predefined topics in canonical order regardless of array order", () => {
    const result = collectWorldNotes([
      {
        id: "world:history",
        name: "World — History",
        legend: "h",
      },
      {
        id: "world:premise",
        name: "World — Premise",
        legend: "p",
      },
      {
        id: "world:cosmology",
        name: "World — Cosmology",
        legend: "c",
      },
    ]);
    expect(result.map((r) => r.topic)).toEqual([
      "premise",
      "cosmology",
      "history",
    ]);
    for (const r of result) expect(r.predefined).toBe(true);
  });

  it("appends user-defined topics alphabetically after predefined", () => {
    const result = collectWorldNotes([
      { id: "world:zeno", name: "z", legend: "" },
      { id: "world:abacus", name: "a", legend: "" },
      { id: "world:premise", name: "World — Premise", legend: "" },
      { id: "world:magic", name: "World — Magic", legend: "" },
      { id: "world:factions", name: "World — Factions", legend: "" },
    ]);
    expect(result.map((r) => r.topic)).toEqual([
      "premise",
      "magic",
      "abacus",
      "factions",
      "zeno",
    ]);
    expect(result.map((r) => r.predefined)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("populates legend_length from the raw legend (no HTML stripping)", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    const result = collectWorldNotes([
      { id: "world:premise", name: "n", legend: html },
    ]);
    expect(result[0]?.legend_length).toBe(html.length);
  });

  it("defaults missing name / legend to empty string + length 0", () => {
    const result = collectWorldNotes([
      { id: "world:premise" },
    ] as unknown as RawNote[]);
    expect(result[0]).toEqual({
      topic: "premise",
      raw_id: "world:premise",
      name: "",
      legend_length: 0,
      predefined: true,
    });
  });

  it("ignores malformed world ids (uppercase / empty / bad chars)", () => {
    const result = collectWorldNotes([
      { id: "world:Premise", name: "n", legend: "" }, // uppercase rejected
      { id: "world:", name: "n", legend: "" }, // empty topic rejected
      { id: "world:has space", name: "n", legend: "" },
      { id: "world:premise", name: "n", legend: "" },
    ]);
    expect(result.map((r) => r.topic)).toEqual(["premise"]);
  });
});

describe("list_world_notes tool — surface", () => {
  it("returns count:0 + empty array when no world notes exist", async () => {
    const tool = createListWorldNotesTool(
      runtimeOf([{ id: "burg12", name: "n", legend: "" }]),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      count: 0,
      notes: [],
    });
  });

  it("returns count:0 when window.notes is missing/null (forgiving)", async () => {
    const tool = createListWorldNotesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      count: 0,
      notes: [],
    });
  });

  it("returns predefined-first then user-defined alphabetical", async () => {
    const tool = createListWorldNotesTool(
      runtimeOf([
        { id: "world:zeno", name: "z", legend: "z body" },
        {
          id: "world:cosmology",
          name: "World — Cosmology",
          legend: "c",
        },
        { id: "world:abacus", name: "a", legend: "a body" },
        {
          id: "world:premise",
          name: "World — Premise",
          legend: "p",
        },
      ]),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(4);
    expect(body.notes.map((n: { topic: string }) => n.topic)).toEqual([
      "premise",
      "cosmology",
      "abacus",
      "zeno",
    ]);
    expect(
      body.notes.map((n: { predefined: boolean }) => n.predefined),
    ).toEqual([true, true, false, false]);
  });

  it("each entry carries topic / raw_id / name / legend_length / predefined", async () => {
    const tool = createListWorldNotesTool(
      runtimeOf([
        {
          id: "world:premise",
          name: "World — Premise",
          legend: "abc",
        },
      ]),
    );
    const result = await tool.execute({});
    expect(JSON.parse(result.content).notes[0]).toEqual({
      topic: "premise",
      raw_id: "world:premise",
      name: "World — Premise",
      legend_length: 3,
      predefined: true,
    });
  });

  it("is exported as listWorldNotesTool with empty input schema", () => {
    expect(listWorldNotesTool.name).toBe("list_world_notes");
    expect(listWorldNotesTool.input_schema.type).toBe("object");
    expect(listWorldNotesTool.input_schema.required).toBeUndefined();
  });
});

describe("defaultListWorldNotesRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { notes?: unknown };
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.notes = [
      { id: "burg12", name: "Rookholm", legend: "Trade city." },
      {
        id: "world:premise",
        name: "World — Premise",
        legend: "A world.",
      },
      { id: "world:factions", name: "World — Factions", legend: "F." },
      {
        id: "world:cosmology",
        name: "World — Cosmology",
        legend: "C.",
      },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    globalsRef.notes = originalNotes;
  });

  it("reads through live globalThis.notes end-to-end", async () => {
    const result = await listWorldNotesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(3);
    expect(body.notes.map((n: { topic: string }) => n.topic)).toEqual([
      "premise",
      "cosmology",
      "factions",
    ]);
  });

  it("returns count:0 when globalThis.notes is missing", async () => {
    globalsRef.notes = undefined;
    const result = await listWorldNotesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      count: 0,
      notes: [],
    });
  });

  it("returns count:0 when globalThis.notes is not an array", async () => {
    globalsRef.notes = { foo: "bar" };
    const result = await listWorldNotesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).count).toBe(0);
  });
});
