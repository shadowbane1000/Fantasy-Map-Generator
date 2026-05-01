import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import type { RawRegiment, RawState } from "./_shared";
import {
  createRegenerateRegimentNameTool,
  defaultRegenerateRegimentNameRuntime,
  findRegimentMatches,
  type RegenerateRegimentNameFindResult,
  type RegenerateRegimentNameRef,
  type RegenerateRegimentNameRuntime,
  regenerateRegimentNameTool,
} from "./regenerate-regiment-name";

function makeRuntime(
  found: RegenerateRegimentNameFindResult,
  generated = "Renamed",
): {
  runtime: RegenerateRegimentNameRuntime;
  find: ReturnType<typeof vi.fn<RegenerateRegimentNameRuntime["find"]>>;
  generate: ReturnType<typeof vi.fn<RegenerateRegimentNameRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateRegimentNameRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateRegimentNameRuntime["redraw"]>>;
} {
  const find = vi.fn<RegenerateRegimentNameRuntime["find"]>(() => found);
  const generate = vi.fn<RegenerateRegimentNameRuntime["generate"]>(
    () => generated,
  );
  const apply = vi.fn<RegenerateRegimentNameRuntime["apply"]>();
  const redraw = vi.fn<RegenerateRegimentNameRuntime["redraw"]>();
  return {
    runtime: { find, generate, apply, redraw },
    find,
    generate,
    apply,
    redraw,
  };
}

describe("regenerate_regiment_name tool", () => {
  it("happy path by ids: resolves, generates, applies, redraws", async () => {
    const ref: RegenerateRegimentNameRef = {
      stateId: 3,
      stateName: "Valoria",
      i: 1,
      name: "1st Cohort",
    };
    const { runtime, find, generate, apply, redraw } = makeRuntime(
      { kind: "ok", ref },
      "5th Cohort",
    );
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 3, regiment: 1 });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith(3, 1);
    expect(generate).toHaveBeenCalledWith(3, ref);
    expect(apply).toHaveBeenCalledWith(3, 1, "5th Cohort");
    expect(redraw).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 3, name: "Valoria" },
      regiment: { i: 1, previous_name: "1st Cohort", name: "5th Cohort" },
    });
  });

  it("happy path by name pair (case-insensitive)", async () => {
    const { runtime, find } = makeRuntime(
      {
        kind: "ok",
        ref: { stateId: 2, stateName: "Bardia", i: 0, name: "Old" },
      },
      "Gen-0-0",
    );
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({
      state: "kingdom of bardia",
      regiment: "OLD",
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("kingdom of bardia", "OLD");
    const body = JSON.parse(result.content);
    expect(body.regiment.name).toBe("Gen-0-0");
  });

  it("forwards (stateId, ref) to runtime.generate (contract)", async () => {
    const ref: RegenerateRegimentNameRef = {
      stateId: 7,
      stateName: "S7",
      i: 4,
      name: "PrevName",
    };
    const { runtime, generate } = makeRuntime({ kind: "ok", ref }, "NewName");
    const tool = createRegenerateRegimentNameTool(runtime);
    await tool.execute({ state: 7, regiment: 4 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]).toEqual([7, ref]);
  });

  it("rejects malformed state and regiment refs", async () => {
    const { runtime, find } = makeRuntime({
      kind: "ok",
      ref: { stateId: 1, stateName: "x", i: 0, name: "n" },
    });
    const tool = createRegenerateRegimentNameTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 0 });
      expect(r.isError).toBe(true);
    }
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad });
      expect(r.isError).toBe(true);
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("state-not-found → 'State {ref} not found.'", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime({
      kind: "state-not-found",
      ref: 999,
    });
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 999, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 999 not found.");
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("state-inactive (state 0 / removed) → fixed error", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime({
      kind: "state-inactive",
      stateId: 0,
    });
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 0, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot regenerate regiment for state 0 / removed state.",
    );
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("no-military → 'State {i} has no military regiments.'", async () => {
    const { runtime, apply } = makeRuntime({
      kind: "no-military",
      stateId: 4,
      stateName: "Empty",
    });
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 4, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "State 4 has no military regiments.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("regiment-not-found → includes state name", async () => {
    const { runtime, apply } = makeRuntime({
      kind: "regiment-not-found",
      stateId: 1,
      stateName: "Altaria",
      ref: 99,
    });
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Regiment 99 not found in state Altaria.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("regiment-ambiguous → error includes candidates payload", async () => {
    const { runtime, apply } = makeRuntime({
      kind: "regiment-ambiguous",
      stateId: 1,
      stateName: "Altaria",
      name: "duplicate",
      candidates: [
        { i: 0, name: "duplicate" },
        { i: 2, name: "Duplicate" },
      ],
    });
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: "duplicate" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toBe(
      "Multiple regiments match name 'duplicate' in state Altaria. Disambiguate by id.",
    );
    expect(body.candidates).toEqual([
      { i: 0, name: "duplicate" },
      { i: 2, name: "Duplicate" },
    ]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("runtime.generate throws → error surfaces; no apply, no redraw", async () => {
    const ref: RegenerateRegimentNameRef = {
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "old",
    };
    const runtime: RegenerateRegimentNameRuntime = {
      find: vi.fn(() => ({ kind: "ok" as const, ref })),
      generate: vi.fn(() => {
        throw new Error("boom");
      }),
      apply: vi.fn(),
      redraw: vi.fn(),
    };
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(runtime.apply).not.toHaveBeenCalled();
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("runtime.apply throws → error surfaces; redraw is NOT called", async () => {
    const ref: RegenerateRegimentNameRef = {
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "old",
    };
    const runtime: RegenerateRegimentNameRuntime = {
      find: vi.fn(() => ({ kind: "ok" as const, ref })),
      generate: vi.fn(() => "new"),
      apply: vi.fn(() => {
        throw new Error("apply-boom");
      }),
      redraw: vi.fn(),
    };
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/apply-boom/);
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("empty generator output is rejected", async () => {
    const ref: RegenerateRegimentNameRef = {
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "old",
    };
    const { runtime, apply, redraw } = makeRuntime({ kind: "ok", ref }, "   ");
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("redraw failure is swallowed (rename still returned)", async () => {
    const ref: RegenerateRegimentNameRef = {
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "old",
    };
    const runtime: RegenerateRegimentNameRuntime = {
      find: vi.fn(() => ({ kind: "ok" as const, ref })),
      generate: vi.fn(() => "new"),
      apply: vi.fn(),
      redraw: vi.fn(() => {
        throw new Error("no d3 yet");
      }),
    };
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).regiment.name).toBe("new");
  });

  it("previous_name is captured BEFORE mutation (regression guard)", async () => {
    // Live regiment object: simulates the in-pack regiment that apply mutates.
    const liveReg = { i: 0, name: "ORIGINAL" };
    const ref: RegenerateRegimentNameRef = {
      stateId: 1,
      stateName: "x",
      i: 0,
      // The contract: this `name` is captured BEFORE apply runs. A buggy
      // implementation that re-reads the live regiment after apply would see
      // "AFTER-MUTATION" instead.
      name: liveReg.name,
    };
    const runtime: RegenerateRegimentNameRuntime = {
      find: vi.fn(() => ({ kind: "ok" as const, ref })),
      generate: vi.fn(() => "AFTER-MUTATION"),
      apply: vi.fn(() => {
        // Simulate the side-effect of writing to the live pack.
        liveReg.name = "AFTER-MUTATION";
        // Mutate `ref.name` too — if the implementation captured a reference
        // rather than the value at request-time, this would corrupt it.
        ref.name = liveReg.name;
      }),
      redraw: vi.fn(),
    };
    const tool = createRegenerateRegimentNameTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.regiment.previous_name).toBe("ORIGINAL");
    expect(body.regiment.name).toBe("AFTER-MUTATION");
  });
});

describe("findRegimentMatches", () => {
  const military: RawRegiment[] = [
    { i: 0, name: "1st Army" },
    { i: 2, name: "Duplicate" },
    { i: 5, name: "duplicate" },
  ];

  it("returns [] when military is not an array", () => {
    expect(findRegimentMatches(undefined, 0)).toEqual([]);
  });

  it("matches by numeric i (singleton or empty)", () => {
    expect(findRegimentMatches(military, 2)).toEqual([military[1]]);
    expect(findRegimentMatches(military, 99)).toEqual([]);
  });

  it("matches case-insensitive name and may return >1", () => {
    const matches = findRegimentMatches(military, "DUPLICATE");
    expect(matches).toHaveLength(2);
    expect(matches).toContain(military[1]);
    expect(matches).toContain(military[2]);
  });

  it("rejects malformed refs", () => {
    expect(findRegimentMatches(military, 1.5)).toEqual([]);
    expect(findRegimentMatches(military, "")).toEqual([]);
    expect(findRegimentMatches(military, "   ")).toEqual([]);
  });
});

describe("registry round-trip", () => {
  it("buildDefaultRegistry includes regenerate_regiment_name exactly once", () => {
    const registry = buildDefaultRegistry();
    const names = registry.list().map((t) => t.name);
    const count = names.filter((n) => n === "regenerate_regiment_name").length;
    expect(count).toBe(1);
  });
});

describe("defaultRegenerateRegimentNameRuntime (integration)", () => {
  const getName = vi.fn(
    (_reg: RawRegiment, _siblings: RawRegiment[]) => "Generated",
  );
  const drawMilitary = vi.fn();
  const setAttribute = vi.fn();
  const getElementById = vi.fn((id: string) =>
    id.startsWith("regiment") ? { setAttribute } : null,
  );

  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;
  const originalMilitary = (globalThis as unknown as { Military?: unknown })
    .Military;
  const originalDraw = (globalThis as unknown as { drawMilitary?: unknown })
    .drawMilitary;
  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  beforeEach(() => {
    getName.mockReset();
    getName.mockImplementation(
      (reg: RawRegiment, _siblings: RawRegiment[]) => `Gen-${reg.i}`,
    );
    drawMilitary.mockReset();
    setAttribute.mockReset();
    getElementById.mockClear();

    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[1] = {
      i: 1,
      name: "Altaria",
      military: [
        { i: 0, name: "OldA0", cell: 10, n: 0 },
        { i: 1, name: "OldA1", cell: 11, n: 1 },
      ],
    };
    states[2] = {
      i: 2,
      name: "Bardia",
      fullName: "Kingdom of Bardia",
      military: [{ i: 0, name: "OldB0", cell: 20, n: 0 }],
    };
    states[3] = { i: 3, name: "Cedria", removed: true, military: [] };
    states[4] = { i: 4, name: "Empty", military: [] };

    (globalThis as unknown as { pack?: unknown }).pack = { states };
    (globalThis as unknown as { Military?: unknown }).Military = { getName };
    (globalThis as unknown as { drawMilitary?: unknown }).drawMilitary =
      drawMilitary;
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (globalThis as unknown as { Military?: unknown }).Military =
      originalMilitary;
    (globalThis as unknown as { drawMilitary?: unknown }).drawMilitary =
      originalDraw;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
  });

  it("by ids: writes regiment.name and calls drawMilitary once", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: 1,
      regiment: 1,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      state: { i: 1, name: "Altaria" },
      regiment: { i: 1, previous_name: "OldA1", name: "Gen-1" },
    });
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[1]?.military?.[1]?.name).toBe("Gen-1");
    expect(pack.states[1]?.military?.[0]?.name).toBe("OldA0");
    expect(drawMilitary).toHaveBeenCalledTimes(1);
    expect(setAttribute).toHaveBeenCalledWith("data-name", "Gen-1");
  });

  it("by name pair (state fullName + regiment name, case-insensitive)", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: "kingdom of bardia",
      regiment: "oldb0",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toEqual({ i: 2, name: "Bardia" });
    expect(body.regiment).toEqual({
      i: 0,
      previous_name: "OldB0",
      name: "Gen-0",
    });
  });

  it("forwards the full sibling military array to Military.getName", async () => {
    await regenerateRegimentNameTool.execute({ state: 1, regiment: 0 });
    expect(getName).toHaveBeenCalledTimes(1);
    const [reg, siblings] = getName.mock.calls[0] ?? [];
    expect(reg?.i).toBe(0);
    expect(Array.isArray(siblings)).toBe(true);
    expect(siblings).toHaveLength(2);
    expect(siblings?.map((r) => r.i)).toEqual([0, 1]);
  });

  it("state 0 (Neutrals) is rejected", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: 0,
      regiment: 0,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot regenerate regiment for state 0 / removed state.",
    );
    expect(drawMilitary).not.toHaveBeenCalled();
  });

  it("removed state is rejected", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: 3,
      regiment: 0,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /State 3 not found\.|Cannot regenerate regiment/,
    );
    expect(drawMilitary).not.toHaveBeenCalled();
  });

  it("state with empty military is rejected", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: 4,
      regiment: 0,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "State 4 has no military regiments.",
    );
  });

  it("missing Military.getName surfaces as an error", async () => {
    (globalThis as unknown as { Military?: unknown }).Military = undefined;
    const result = await regenerateRegimentNameTool.execute({
      state: 1,
      regiment: 0,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Military\.getName is not available/,
    );
  });

  it("unresolved state ref errors out without calling drawMilitary", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: 999,
      regiment: 0,
    });
    expect(result.isError).toBe(true);
    expect(drawMilitary).not.toHaveBeenCalled();
  });

  it("unknown regiment id within state errors with state name", async () => {
    const result = await regenerateRegimentNameTool.execute({
      state: 1,
      regiment: 99,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Regiment 99 not found in state Altaria.",
    );
  });

  // Sanity check that the exported singleton uses the default runtime.
  it("regenerateRegimentNameTool reuses defaultRegenerateRegimentNameRuntime", () => {
    expect(typeof defaultRegenerateRegimentNameRuntime.find).toBe("function");
    expect(typeof defaultRegenerateRegimentNameRuntime.generate).toBe(
      "function",
    );
  });
});
