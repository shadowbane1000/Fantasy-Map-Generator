import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote } from "./_shared";
import {
  createGetNoteInfoTool,
  getNoteInfoTool,
  type NoteInfoRuntime,
  type ReadNoteInfoResult,
} from "./get-note-info";

function runtimeReturning(result: ReadNoteInfoResult): NoteInfoRuntime {
  return { readNote: () => result };
}

describe("get_note_info tool — pure / seam", () => {
  it("returns full id / name / legend on happy path", async () => {
    const runtime = runtimeReturning({
      id: "burg12",
      name: "Rookholm",
      legend: "<p>Old lore</p>",
    });
    const tool = createGetNoteInfoTool(runtime);
    const result = await tool.execute({ id: "burg12" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "burg12",
      name: "Rookholm",
      legend: "<p>Old lore</p>",
    });
  });

  it("trims the id before looking up", async () => {
    const readNote = vi.fn<NoteInfoRuntime["readNote"]>(
      (id: string): ReadNoteInfoResult =>
        id === "state3" ? { id, name: "Ashholm", legend: "" } : "not-found",
    );
    const tool = createGetNoteInfoTool({ readNote });
    const result = await tool.execute({ id: "  state3  " });
    expect(readNote).toHaveBeenCalledWith("state3");
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).id).toBe("state3");
  });

  it("returns long legends untruncated (no cap like get_marker_info)", async () => {
    const long = "A".repeat(5000);
    const tool = createGetNoteInfoTool(
      runtimeReturning({ id: "marker7", name: "Big", legend: long }),
    );
    const result = await tool.execute({ id: "marker7" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.legend).toBe(long);
    expect(body.legend.length).toBe(5000);
  });

  it("echoes raw HTML legends verbatim (no stripping like list_notes)", async () => {
    const html =
      "<h1>Title</h1><p>Body with <strong>bold</strong> & <em>italic</em>.</p>";
    const tool = createGetNoteInfoTool(
      runtimeReturning({ id: "state3", name: "n", legend: html }),
    );
    const result = await tool.execute({ id: "state3" });
    expect(JSON.parse(result.content).legend).toBe(html);
  });

  it("name / legend default to empty strings when missing in the runtime result", async () => {
    // Simulate a runtime that already normalised to empty strings — the
    // happy path produces `name: ""` / `legend: ""` rather than nulls.
    const tool = createGetNoteInfoTool(
      runtimeReturning({ id: "x", name: "", legend: "" }),
    );
    const result = await tool.execute({ id: "x" });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "x",
      name: "",
      legend: "",
    });
  });

  it("rejects invalid ids", async () => {
    const readNote = vi.fn<NoteInfoRuntime["readNote"]>(
      (): ReadNoteInfoResult => "not-found",
    );
    const tool = createGetNoteInfoTool({ readNote });
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ id: bad });
      expect(r.isError).toBe(true);
    }
    expect(readNote).not.toHaveBeenCalled();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetNoteInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ id: "burg12" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Notes are not available/i,
    );
  });

  it("surfaces 'not-found' with the ref JSON-quoted", async () => {
    const tool = createGetNoteInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ id: "ghost" });
    expect(result.isError).toBe(true);
    const msg = JSON.parse(result.content).error;
    expect(msg).toMatch(/No note found/i);
    expect(msg).toMatch(/"ghost"/);
  });

  it("is exported as getNoteInfoTool with the expected schema", () => {
    expect(getNoteInfoTool.name).toBe("get_note_info");
    expect(getNoteInfoTool.input_schema.type).toBe("object");
    expect(getNoteInfoTool.input_schema.required).toEqual(["id"]);
    expect(getNoteInfoTool.input_schema.properties.id).toBeDefined();
  });
});

describe("defaultNoteInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { notes?: unknown };
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.notes = [
      { id: "burg12", name: "Rookholm", legend: "<p>Old lore</p>" },
      {
        id: "state3",
        name: "Ashholm",
        legend: "A rising power with a very long history.".repeat(200),
      },
      { id: "bare" }, // no name/legend fields
    ] satisfies RawNote[] as unknown;
  });

  afterEach(() => {
    globalsRef.notes = originalNotes;
  });

  it("reads an existing note through the live global", async () => {
    const result = await getNoteInfoTool.execute({ id: "burg12" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "burg12",
      name: "Rookholm",
      legend: "<p>Old lore</p>",
    });
  });

  it("returns long legends untruncated from the live global", async () => {
    const result = await getNoteInfoTool.execute({ id: "state3" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    // 38 chars × 200 = 7600 — comfortably past any marker-info-style cap.
    expect(body.legend.length).toBe(
      "A rising power with a very long history.".repeat(200).length,
    );
  });

  it("defaults missing name / legend to empty strings", async () => {
    const result = await getNoteInfoTool.execute({ id: "bare" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "bare",
      name: "",
      legend: "",
    });
  });

  it("errors with not-found for an unknown id", async () => {
    const result = await getNoteInfoTool.execute({ id: "ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No note found/i);
  });

  it("errors with not-ready when window.notes is missing", async () => {
    globalsRef.notes = undefined;
    const result = await getNoteInfoTool.execute({ id: "burg12" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("errors with not-ready when window.notes is not an array", async () => {
    globalsRef.notes = { id: "burg12" } as unknown;
    const result = await getNoteInfoTool.execute({ id: "burg12" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });
});
