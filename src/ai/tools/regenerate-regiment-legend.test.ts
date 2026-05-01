import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawNote, RawRegiment, RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRegenerateRegimentLegendTool,
  type RegenerateRegimentLegendFound,
  type RegenerateRegimentLegendNoteRef,
  type RegenerateRegimentLegendRuntime,
  regenerateRegimentLegendTool,
} from "./regenerate-regiment-legend";

interface Fixtures {
  find?: (
    stateRef: number | string,
    regRef: number | string,
  ) => RegenerateRegimentLegendFound | null;
  readNote?: (id: string) => RegenerateRegimentLegendNoteRef | null;
  removeNote?: (id: string) => void;
  regenerate?: (stateId: number, regimentI: number) => void;
}

function makeRuntime(f: Fixtures = {}) {
  const find = vi.fn<RegenerateRegimentLegendRuntime["find"]>(
    f.find ?? (() => null),
  );
  const readNote = vi.fn<RegenerateRegimentLegendRuntime["readNote"]>(
    f.readNote ?? (() => null),
  );
  const removeNote = vi.fn<RegenerateRegimentLegendRuntime["removeNote"]>(
    f.removeNote ?? (() => {}),
  );
  const regenerate = vi.fn<RegenerateRegimentLegendRuntime["regenerate"]>(
    f.regenerate ?? (() => {}),
  );
  const runtime: RegenerateRegimentLegendRuntime = {
    find,
    readNote,
    removeNote,
    regenerate,
  };
  return { runtime, find, readNote, removeNote, regenerate };
}

describe("regenerate_regiment_legend tool", () => {
  it("happy path: pre-existing note replaced; ORDER asserted", async () => {
    const { runtime, find, readNote, removeNote, regenerate } = makeRuntime({
      find: () => ({
        state: { i: 3, name: "Valoria" },
        regiment: { i: 1, name: "5th Cohort" },
      }),
    });
    readNote
      .mockImplementationOnce(() => ({
        id: "regiment3-1",
        name: "5th Cohort",
        legend: "Old legend",
      }))
      .mockImplementationOnce(() => ({
        id: "regiment3-1",
        name: "5th Cohort",
        legend: "New legend",
      }));

    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: "Valoria", regiment: 1 });

    expect(result.isError).toBeFalsy();
    expect(find.mock.calls[0]).toEqual(["Valoria", 1]);
    expect(removeNote.mock.calls[0]).toEqual(["regiment3-1"]);
    expect(regenerate.mock.calls[0]).toEqual([3, 1]);
    expect(readNote.mock.calls.length).toBe(2);
    expect(readNote.mock.calls[0][0]).toBe("regiment3-1");
    expect(readNote.mock.calls[1][0]).toBe("regiment3-1");

    // ORDER: removeNote BEFORE regenerate.
    expect(removeNote.mock.invocationCallOrder[0]).toBeLessThan(
      regenerate.mock.invocationCallOrder[0],
    );

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 3, name: "Valoria" },
      regiment: { i: 1, name: "5th Cohort" },
      note_id: "regiment3-1",
      previous_note: {
        id: "regiment3-1",
        name: "5th Cohort",
        legend: "Old legend",
      },
      note: {
        id: "regiment3-1",
        name: "5th Cohort",
        legend: "New legend",
      },
    });
  });

  it("happy path: NO pre-existing note → previous_note=null; new note returned", async () => {
    const { runtime, readNote, removeNote, regenerate } = makeRuntime({
      find: () => ({
        state: { i: 3, name: "Valoria" },
        regiment: { i: 1, name: "5th Cohort" },
      }),
    });
    readNote
      .mockImplementationOnce(() => null)
      .mockImplementationOnce(() => ({
        id: "regiment3-1",
        name: "5th Cohort",
        legend: "New legend",
      }));

    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: "Valoria", regiment: 1 });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_note).toBeNull();
    expect(body.note).toEqual({
      id: "regiment3-1",
      name: "5th Cohort",
      legend: "New legend",
    });
    expect(removeNote.mock.calls).toEqual([["regiment3-1"]]);
    expect(regenerate.mock.calls).toEqual([[3, 1]]);
    expect(removeNote.mock.invocationCallOrder[0]).toBeLessThan(
      regenerate.mock.invocationCallOrder[0],
    );
  });

  it("regenerate succeeds but post-call note still missing → ok with note=null", async () => {
    const { runtime } = makeRuntime({
      find: () => ({
        state: { i: 3, name: "Valoria" },
        regiment: { i: 1, name: "5th Cohort" },
      }),
      readNote: () => null,
    });

    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: "Valoria", regiment: 1 });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_note).toBeNull();
    expect(body.note).toBeNull();
    expect(body.note_id).toBe("regiment3-1");
  });

  it("state/regiment resolution failure → error, no mutation", async () => {
    const { runtime, find, readNote, removeNote, regenerate } = makeRuntime({
      find: () => null,
    });
    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: 999, regiment: 0 });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /No regiment found matching state=999, regiment=0/,
    );
    expect(find.mock.calls.length).toBe(1);
    expect(readNote.mock.calls.length).toBe(0);
    expect(removeNote.mock.calls.length).toBe(0);
    expect(regenerate.mock.calls.length).toBe(0);
  });

  it("invalid state ref shapes rejected before find", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createRegenerateRegimentLegendTool(runtime);
    const cases: Array<Record<string, unknown>> = [
      {},
      { state: null, regiment: 1 },
      { state: "", regiment: 1 },
      { state: -1, regiment: 1 },
      { state: 1.5, regiment: 1 },
    ];
    for (const c of cases) {
      const result = await tool.execute(c);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(
        /state must be a non-negative integer/,
      );
    }
    expect(find.mock.calls.length).toBe(0);
  });

  it("invalid regiment ref shapes rejected before find", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createRegenerateRegimentLegendTool(runtime);
    const cases: Array<Record<string, unknown>> = [
      { state: 1 },
      { state: 1, regiment: null },
      { state: 1, regiment: "" },
      { state: 1, regiment: -1 },
      { state: 1, regiment: 1.5 },
    ];
    for (const c of cases) {
      const result = await tool.execute(c);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(
        /regiment must be a non-negative integer/,
      );
    }
    expect(find.mock.calls.length).toBe(0);
  });

  it("removeNote throws (notes missing) → error; regenerate NOT called", async () => {
    const { runtime, regenerate } = makeRuntime({
      find: () => ({
        state: { i: 3, name: "Valoria" },
        regiment: { i: 1, name: "5th Cohort" },
      }),
      removeNote: () => {
        throw new Error(
          "window.notes is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 1 });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.notes is not available; the map hasn't finished loading.",
    );
    expect(regenerate.mock.calls.length).toBe(0);
  });

  it("regenerate throws (Military.generateNote missing) → error; removeNote DID happen; ORDER pinned", async () => {
    const { runtime, readNote, removeNote, regenerate } = makeRuntime({
      find: () => ({
        state: { i: 3, name: "Valoria" },
        regiment: { i: 1, name: "5th Cohort" },
      }),
      regenerate: () => {
        throw new Error(
          "Military.generateNote is not available; the map hasn't finished loading.",
        );
      },
    });
    readNote.mockImplementationOnce(() => ({
      id: "regiment3-1",
      name: "5th Cohort",
      legend: "Old legend",
    }));

    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 1 });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Military\.generateNote is not available/,
    );
    expect(removeNote.mock.calls.length).toBe(1);
    expect(removeNote.mock.invocationCallOrder[0]).toBeLessThan(
      regenerate.mock.invocationCallOrder[0],
    );
  });

  it("regenerate throws generic runtime error → propagated", async () => {
    const { runtime } = makeRuntime({
      find: () => ({
        state: { i: 3, name: "Valoria" },
        regiment: { i: 1, name: "5th Cohort" },
      }),
      regenerate: () => {
        throw new Error("boom");
      },
    });
    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 1 });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
  });

  it("tool name + schema + registry round-trip", () => {
    expect(regenerateRegimentLegendTool.name).toBe(
      "regenerate_regiment_legend",
    );
    expect(regenerateRegimentLegendTool.input_schema.required).toEqual([
      "state",
      "regiment",
    ]);
    const reg = new ToolRegistry();
    reg.register(regenerateRegimentLegendTool);
    expect(reg.list().map((t) => t.name)).toContain(
      "regenerate_regiment_legend",
    );
  });

  it("splice-then-push ORDER explicitly verified via shared log", async () => {
    const mutationLog: string[] = [];
    const { runtime, readNote } = makeRuntime({
      find: () => ({
        state: { i: 1, name: "A" },
        regiment: { i: 0, name: "R0" },
      }),
      removeNote: () => {
        mutationLog.push("remove");
      },
      regenerate: () => {
        mutationLog.push("regen");
      },
    });
    readNote
      .mockImplementationOnce(() => null)
      .mockImplementationOnce(() => ({
        id: "regiment1-0",
        name: "R0",
        legend: "Fresh",
      }));

    const tool = createRegenerateRegimentLegendTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });

    expect(result.isError).toBeFalsy();
    expect(mutationLog).toEqual(["remove", "regen"]);
  });
});

describe("defaultRegenerateRegimentLegendRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalMilitary = (globalThis as { Military?: unknown }).Military;
  const originalNotes = (globalThis as { notes?: unknown }).notes;

  function setupPackAndMilitary(): void {
    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[1] = {
      i: 1,
      name: "Valoria",
      military: [
        { i: 0, name: "1st Legion", cell: 10, n: 0 },
        { i: 1, name: "5th Cohort", cell: 11, n: 0 },
      ],
    };
    (globalThis as { pack?: unknown }).pack = { states };
    (globalThis as { Military?: unknown }).Military = {
      generateNote: vi.fn((reg: RawRegiment, state: RawState) => {
        const notes = (globalThis as { notes?: RawNote[] }).notes;
        if (!Array.isArray(notes)) return;
        notes.push({
          id: `regiment${state.i}-${reg.i}`,
          name: reg.name ?? "",
          legend: `Fresh legend for ${reg.name ?? ""}`,
        });
      }),
    };
  }

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { Military?: unknown }).Military = undefined;
    (globalThis as { notes?: unknown }).notes = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Military?: unknown }).Military = originalMilitary;
    (globalThis as { notes?: unknown }).notes = originalNotes;
  });

  it("end-to-end: pre-existing note replaced", async () => {
    setupPackAndMilitary();
    (globalThis as { notes?: RawNote[] }).notes = [
      { id: "regiment1-1", name: "5th Cohort", legend: "Old legend" },
      { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
    ];

    const result = await regenerateRegimentLegendTool.execute({
      state: "Valoria",
      regiment: 1,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 1, name: "Valoria" });
    expect(body.regiment).toEqual({ i: 1, name: "5th Cohort" });
    expect(body.note_id).toBe("regiment1-1");
    expect(body.previous_note).toEqual({
      id: "regiment1-1",
      name: "5th Cohort",
      legend: "Old legend",
    });
    expect(body.note).toEqual({
      id: "regiment1-1",
      name: "5th Cohort",
      legend: "Fresh legend for 5th Cohort",
    });

    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes.length).toBe(2);
    expect(notes.find((n) => n.id === "regiment1-0")).toEqual({
      id: "regiment1-0",
      name: "1st Legion",
      legend: "Untouched",
    });
    expect(notes.find((n) => n.id === "regiment1-1")?.legend).toBe(
      "Fresh legend for 5th Cohort",
    );

    const military = (
      globalThis as unknown as {
        Military: { generateNote: ReturnType<typeof vi.fn> };
      }
    ).Military;
    expect(military.generateNote.mock.calls.length).toBe(1);
    const [reg, state] = military.generateNote.mock.calls[0];
    expect(reg.i).toBe(1);
    expect(state.i).toBe(1);
  });

  it("no pre-existing note → new note appended", async () => {
    setupPackAndMilitary();
    (globalThis as { notes?: RawNote[] }).notes = [
      { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
    ];

    const result = await regenerateRegimentLegendTool.execute({
      state: 1,
      regiment: 1,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_note).toBeNull();
    expect(body.note?.legend).toBe("Fresh legend for 5th Cohort");

    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes.length).toBe(2);
  });

  it("missing Military global → error; previous note IS gone (documented)", async () => {
    setupPackAndMilitary();
    (globalThis as { notes?: RawNote[] }).notes = [
      { id: "regiment1-1", name: "5th Cohort", legend: "Old legend" },
      { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
    ];
    (globalThis as { Military?: unknown }).Military = undefined;

    const result = await regenerateRegimentLegendTool.execute({
      state: 1,
      regiment: 1,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Military\.generateNote is not available/,
    );

    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes.find((n) => n.id === "regiment1-1")).toBeUndefined();
  });

  it("missing notes global → error, NO regenerate call", async () => {
    setupPackAndMilitary();
    (globalThis as { notes?: unknown }).notes = undefined;

    const military = (
      globalThis as unknown as {
        Military: { generateNote: ReturnType<typeof vi.fn> };
      }
    ).Military;

    const result = await regenerateRegimentLegendTool.execute({
      state: 1,
      regiment: 1,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.notes is not available/,
    );
    expect(military.generateNote.mock.calls.length).toBe(0);
  });

  it("state ref doesn't resolve → error; notes untouched", async () => {
    setupPackAndMilitary();
    const baseNotes: RawNote[] = [
      { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
    ];
    (globalThis as { notes?: RawNote[] }).notes = baseNotes;

    const result = await regenerateRegimentLegendTool.execute({
      state: 999,
      regiment: 0,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /No regiment found matching state=999, regiment=0/,
    );

    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toEqual([
      { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
    ]);
  });

  it("case-insensitive state name + per-state regiment id", async () => {
    setupPackAndMilitary();
    (globalThis as { notes?: RawNote[] }).notes = [
      { id: "regiment1-1", name: "5th Cohort", legend: "Old legend" },
      { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
    ];

    const result = await regenerateRegimentLegendTool.execute({
      state: "VALORIA",
      regiment: 0,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state.i).toBe(1);
    expect(body.regiment.i).toBe(0);
    expect(body.note_id).toBe("regiment1-0");
    expect(body.previous_note?.legend).toBe("Untouched");
    expect(body.note?.legend).toBe("Fresh legend for 1st Legion");
  });
});
